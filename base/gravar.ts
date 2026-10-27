/**
 * Gravação transacional por fonte.
 *
 * - Upsert de imóveis por (fonte_id, id_na_fonte): insere o novo, atualiza o que mudou e só
 *   renova `ultima_vez_em` do que ficou igual (comparação por hash do conteúdo normalizado).
 * - Histórico em `preco_historico` quando o imóvel é novo ou muda preço, avaliação,
 *   modalidade, praça ou status, inclusive ao ser removido ou reaparecer.
 * - Numa coleta completa e válida, o que estava ativo e sumiu da fonte vira "removido"
 *   (com trava contra lista truncada). Imóveis nunca são apagados.
 * - Praças, fotos e documentos refletem o estado atual da fonte; a verificação de uma foto
 *   (verificada_em, ok) é preservada enquanto a URL continuar a mesma.
 * - Títulos, descrições e textos são limpos de HTML e mascarados (LGPD) antes de gravar.
 * - Coordenada: a da fonte, conferida, ou a sede do município com precisão "cidade" (base/geo).
 *   Chaves de deduplicação por matrícula + cartório ou por endereço (base/dedup).
 *
 * Tudo roda numa transação: se algo falhar, nada é gravado.
 */
import { lerNumero, lerTexto, sqlBool, transacao, type Banco, type ValorSql } from "./db.ts";
import { chaveDedup, chaveEndereco } from "./dedup/index.ts";
import { manterGeocode } from "./geo/aplicado.ts";
import { geocodificar } from "./geo/geocodificar.ts";
import type {
  Conector,
  Documento,
  EditalNormalizado,
  Foto,
  ImovelNormalizado,
  NumeroPraca,
  Praca,
  StatusImovel,
  Uf,
} from "./tipos.ts";
import { instanteDe } from "./util/data.ts";
import { hashEstavel } from "./util/hash.ts";
import { mascararDadosPessoais, mascararDocumentos } from "./util/lgpd.ts";
import { arredondar } from "./util/numero.ts";
import { colapsarEspacos, semHtml, slug, textoOuNulo, truncar } from "./util/texto.ts";

// ---------------------------------------------------------------------------
// Fonte
// ---------------------------------------------------------------------------

/** Cria ou atualiza a linha da fonte a partir do conector. */
export function garantirFonte(db: Banco, conector: Pick<Conector, "id" | "nome" | "tipo" | "acesso" | "finalidade" | "url" | "capacidades">, agora: Date = new Date()): void {
  const quando = agora.toISOString();
  db.prepare(
    `INSERT INTO fonte (id, nome, tipo, acesso, finalidade, url, publica_fotos, publica_documentos, informa_ocupacao, lista_completa, criada_em, atualizada_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET nome = excluded.nome, tipo = excluded.tipo, acesso = excluded.acesso,
       finalidade = excluded.finalidade, url = excluded.url, publica_fotos = excluded.publica_fotos,
       publica_documentos = excluded.publica_documentos, informa_ocupacao = excluded.informa_ocupacao,
       lista_completa = excluded.lista_completa, atualizada_em = excluded.atualizada_em`,
  ).run(
    conector.id, conector.nome, conector.tipo, conector.acesso, conector.finalidade, conector.url ?? null,
    sqlBool(conector.capacidades.fotos), sqlBool(conector.capacidades.documentos),
    sqlBool(conector.capacidades.ocupacao), sqlBool(conector.capacidades.listaCompleta), quando, quando,
  );
}

// ---------------------------------------------------------------------------
// Preparação (pura, sem banco)
// ---------------------------------------------------------------------------

/** Colunas de conteúdo de `imovel` (sem id, fonte, datas de controle e hash). */
export interface LinhaImovel {
  id_na_fonte: string;
  url: string;
  titulo: string;
  tipo: string;
  uf: string;
  cidade: string;
  cidade_norm: string;
  bairro: string | null;
  endereco: string | null;
  cep: string | null;
  lat: number | null;
  lon: number | null;
  precisao_geo: string | null;
  area_total: number | null;
  area_privativa: number | null;
  area_terreno: number | null;
  quartos: number | null;
  vagas: number | null;
  descricao: string | null;
  textos: string | null;
  extras: string | null;
  modalidade: string;
  modalidade_fonte: string | null;
  judicial: number | null;
  aceita_financiamento: number | null;
  aceita_fgts: number | null;
  aceita_parcelamento: number | null;
  ocupacao: string | null;
  leiloeiro: string | null;
  comitente: string | null;
  numero_processo: string | null;
  matricula: string | null;
  cartorio: string | null;
  valor_avaliacao: number | null;
  preco: number | null;
  desconto_pct: number | null;
  praca_atual: number | null;
  data_praca: string | null;
  status: Exclude<StatusImovel, "removido">;
  chave_dedup: string | null;
  chave_endereco: string | null;
}

export interface ImovelPreparado {
  linha: LinhaImovel;
  pracas: Array<Required<Praca>>;
  fotos: Array<Required<Foto>>;
  documentos: Array<Required<Documento>>;
  hash: string;
  /** Problema da geocodificação (cidade não reconhecida, coordenada da fonte descartada), para o log. */
  alertaGeo: string | null;
}

function dinheiro(valor: number | null | undefined): number | null {
  return valor === null || valor === undefined ? null : arredondar(valor, 2);
}

/** Sem HTML, mascarado, com espaços simples e quebras de parágrafo preservadas; null se vazio. */
export function textoLimpo(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const limpo = mascararDadosPessoais(semHtml(valor))
    .replace(/[ \t\f\v\r]+/g, " ")
    .replace(/ *\n[ \n]*/g, "\n")
    .trim();
  return limpo === "" ? null : limpo;
}

/**
 * Praça em vigor deduzida pelas datas: a primeira (em ordem de número) que ainda não passou;
 * se todas passaram, a última; sem datas, a única praça, ou `null` se houver várias.
 */
export function derivarPracaAtual(pracas: readonly Praca[], agora: Date): NumeroPraca | null {
  if (pracas.length === 0) return null;
  const ordenadas = [...pracas].sort((a, b) => a.numero - b.numero);
  if (ordenadas.length === 1) return ordenadas[0]?.numero ?? null;
  const comData = ordenadas.filter((p) => p.data && instanteDe(p.data) !== null);
  if (comData.length === 0) return null;
  const futura = comData.find((p) => (instanteDe(p.data as string) ?? 0) >= agora.getTime());
  return (futura ?? comData[comData.length - 1])?.numero ?? null;
}

/** Desconto em % sobre a avaliação; negativo quando o preço passa da avaliação. */
export function calcularDesconto(preco: number | null, avaliacao: number | null): number | null {
  if (preco === null || avaliacao === null || avaliacao <= 0 || preco <= 0) return null;
  return arredondar((1 - preco / avaliacao) * 100, 2);
}

/** Limpa, mascara e deriva os campos de um imóvel normalizado. Não acessa o banco. */
export function prepararImovel(imovel: ImovelNormalizado, agora: Date = new Date()): ImovelPreparado {
  const pracas = [...imovel.pracas]
    .sort((a, b) => a.numero - b.numero)
    .map((p) => ({ numero: p.numero, data: p.data ?? null, valor_minimo: dinheiro(p.valor_minimo) }));
  // praca_incerta: a fonte não diz qual praça vale; nada é deduzido, mas a data de uma praça
  // única segue em data_praca (a exportação a usa para tirar o imóvel do ar).
  const incerta = imovel.praca_incerta === true;
  const pracaAtual = incerta ? null : (imovel.praca_atual ?? derivarPracaAtual(pracas, agora));
  const daPraca =
    pracaAtual !== null ? pracas.find((p) => p.numero === pracaAtual) : incerta && pracas.length === 1 ? pracas[0] : undefined;
  const preco = dinheiro(imovel.preco ?? daPraca?.valor_minimo ?? null);
  const avaliacao = dinheiro(imovel.valor_avaliacao);
  const cidade = colapsarEspacos(imovel.cidade);
  const endereco = textoOuNulo(imovel.endereco);
  const matricula = textoOuNulo(imovel.matricula);
  const cartorio = textoOuNulo(imovel.cartorio);
  const cepDigitos = imovel.cep ? imovel.cep.replace(/\D/g, "") : "";

  const textos = (imovel.textos ?? [])
    .map((t) => ({ origem: colapsarEspacos(t.origem), texto: textoLimpo(t.texto) }))
    .filter((t): t is { origem: string; texto: string } => t.texto !== null);

  const vistasFotos = new Set<string>();
  const fotos = imovel.fotos
    .map((f, i) => ({ ...f, ordem: f.ordem ?? i }))
    .sort((a, b) => a.ordem - b.ordem)
    .filter((f) => !vistasFotos.has(f.url) && Boolean(vistasFotos.add(f.url)))
    .map((f) => ({
      url: f.url,
      ordem: f.ordem,
      tamanho: textoOuNulo(f.tamanho),
      origem: colapsarEspacos(f.origem),
      verificada_em: f.verificada_em ?? null,
      ok: f.ok ?? null,
    }));

  const vistosDocs = new Set<string>();
  const documentos = imovel.documentos
    .filter((d) => !vistosDocs.has(d.url) && Boolean(vistosDocs.add(d.url)))
    .map((d) => ({
      tipo: d.tipo,
      titulo: d.titulo ? textoOuNulo(mascararDadosPessoais(semHtml(d.titulo))) : null,
      url: d.url,
      publicado_em: d.publicado_em ?? null,
    }));

  // Coordenada da fonte conferida, senão a sede do município (precisão "cidade"); ver base/geo.
  const geo = geocodificar({ uf: imovel.uf, cidade, lat: imovel.lat, lon: imovel.lon, precisao_geo: imovel.precisao_geo });
  const bairro = textoOuNulo(imovel.bairro);
  const dadosChave = { uf: imovel.uf, cidade, codigo_ibge: geo.codigo_ibge, bairro, endereco, matricula, cartorio };
  const linha: LinhaImovel = {
    id_na_fonte: imovel.id_na_fonte.trim(),
    url: imovel.url.trim(),
    titulo: textoLimpo(imovel.titulo)?.replace(/\s+/g, " ") ?? imovel.id_na_fonte,
    tipo: imovel.tipo,
    uf: imovel.uf,
    cidade,
    cidade_norm: slug(cidade),
    bairro,
    endereco,
    cep: cepDigitos.length === 8 ? cepDigitos : null,
    lat: geo.lat,
    lon: geo.lon,
    precisao_geo: geo.precisao_geo,
    area_total: imovel.area_total ?? null,
    area_privativa: imovel.area_privativa ?? null,
    area_terreno: imovel.area_terreno ?? null,
    quartos: imovel.quartos ?? null,
    vagas: imovel.vagas ?? null,
    descricao: textoLimpo(imovel.descricao),
    textos: textos.length > 0 ? JSON.stringify(textos) : null,
    extras: imovel.extras && Object.keys(imovel.extras).length > 0 ? JSON.stringify(imovel.extras) : null,
    modalidade: imovel.modalidade,
    modalidade_fonte: textoOuNulo(imovel.modalidade_fonte),
    judicial: sqlBool(imovel.judicial),
    aceita_financiamento: sqlBool(imovel.aceita_financiamento),
    aceita_fgts: sqlBool(imovel.aceita_fgts),
    aceita_parcelamento: sqlBool(imovel.aceita_parcelamento),
    ocupacao: imovel.ocupacao ?? null,
    leiloeiro: imovel.leiloeiro ? textoOuNulo(mascararDocumentos(imovel.leiloeiro)) : null,
    comitente: imovel.comitente ? textoOuNulo(mascararDocumentos(imovel.comitente)) : null,
    numero_processo: textoOuNulo(imovel.numero_processo),
    matricula,
    cartorio,
    valor_avaliacao: avaliacao,
    preco,
    desconto_pct: calcularDesconto(preco, avaliacao),
    praca_atual: pracaAtual,
    data_praca: daPraca?.data ?? null,
    status: imovel.status ?? "ativo",
    chave_dedup: chaveDedup(dadosChave),
    chave_endereco: chaveEndereco(dadosChave),
  };

  // A verificação das fotos fica fora do hash: reverificar não é mudança de conteúdo.
  const hash = hashEstavel({
    linha,
    pracas,
    fotos: fotos.map(({ url, ordem, tamanho, origem }) => ({ url, ordem, tamanho, origem })),
    documentos,
  });
  return { linha, pracas, fotos, documentos, hash, alertaGeo: geo.alerta };
}

// ---------------------------------------------------------------------------
// Gravação de imóveis
// ---------------------------------------------------------------------------

export interface OpcoesGravacao {
  /**
   * A coleta cobriu a fonte inteira (ou a UF inteira, com `escopoUf`)? Só então quem estava
   * ativo e não veio passa a "removido". Padrão false.
   */
  completa?: boolean;
  /** Restringe a marcação de removidos a uma UF (coleta com --uf). */
  escopoUf?: Uf | null;
  /** Fração máxima de ativos do escopo que pode ser removida de uma vez (padrão 0,5). */
  maxFracaoRemocao?: number;
  /** Ids que vieram da fonte mas não passaram na validação: nunca são marcados como removidos. */
  idsProtegidos?: Iterable<string>;
  /**
   * Data de geração do lote na fonte (ex.: "Data de geração" do CSV). Um imóvel gravado a partir
   * de uma geração mais nova nunca é alterado, reativado nem removido por um lote mais antigo
   * (ex.: CSV geral da Caixa, que atrasa um dia, depois do CSV da UF).
   */
  geradoEm?: string | null;
  coletaId?: number | null;
  agora?: Date;
}

export interface ResultadoGravacao {
  novos: number;
  atualizados: number;
  inalterados: number;
  reativados: number;
  removidos: number;
  /** Ignorados porque o gravado veio de uma geração mais nova da fonte. */
  antigos: number;
  /** Registros repetidos no lote (mesmo id_na_fonte); vale o último. */
  duplicados: number;
  /** "feita": marcou removidos (talvez zero); "nao_pedida": coleta parcial; "bloqueada": trava acionada. */
  remocao: "feita" | "nao_pedida" | "bloqueada";
  avisos: string[];
}

const COLUNAS_IMOVEL: ReadonlyArray<keyof LinhaImovel> = [
  "id_na_fonte", "url", "titulo", "tipo", "uf", "cidade", "cidade_norm", "bairro", "endereco", "cep", "lat", "lon",
  "precisao_geo", "area_total", "area_privativa", "area_terreno", "quartos", "vagas", "descricao", "textos", "extras",
  "modalidade", "modalidade_fonte", "judicial", "aceita_financiamento", "aceita_fgts", "aceita_parcelamento", "ocupacao",
  "leiloeiro", "comitente", "numero_processo", "matricula", "cartorio", "valor_avaliacao", "preco", "desconto_pct",
  "praca_atual", "data_praca", "status", "chave_dedup", "chave_endereco",
];

/** Campos acompanhados no histórico. */
const CAMPOS_HISTORICO = ["preco", "valor_avaliacao", "modalidade", "praca_atual", "status"] as const;

interface Existente {
  id: number;
  hash: string;
  status: StatusImovel;
  preco: number | null;
  valor_avaliacao: number | null;
  modalidade: string;
  praca_atual: number | null;
}

/** `true` se `lote` é de uma geração anterior à do dado gravado (as duas conhecidas). */
function loteMaisAntigo(lote: string | null | undefined, gravado: string | null): boolean {
  if (!lote || !gravado) return false;
  const a = instanteDe(lote);
  const b = instanteDe(gravado);
  return a !== null && b !== null && a < b;
}

function valoresLinha(linha: LinhaImovel): ValorSql[] {
  return COLUNAS_IMOVEL.map((coluna) => linha[coluna] as ValorSql);
}

/**
 * Grava imóveis de UMA fonte numa transação. A fonte precisa existir (garantirFonte).
 * Registros devem ter passado por validarImovel.
 */
export function gravarImoveis(
  db: Banco,
  fonteId: string,
  imoveis: readonly ImovelNormalizado[],
  opcoes: OpcoesGravacao = {},
): ResultadoGravacao {
  const agora = opcoes.agora ?? new Date();
  const quando = agora.toISOString();
  const coletaId = opcoes.coletaId ?? null;
  const geradoEm = opcoes.geradoEm ?? null;
  const resultado: ResultadoGravacao = {
    novos: 0, atualizados: 0, inalterados: 0, reativados: 0, removidos: 0, antigos: 0, duplicados: 0,
    remocao: opcoes.completa ? "feita" : "nao_pedida", avisos: [],
  };

  const porId = new Map<string, ImovelNormalizado>();
  for (const imovel of imoveis) {
    const id = imovel.id_na_fonte.trim();
    if (porId.has(id)) resultado.duplicados++;
    porId.set(id, imovel);
  }
  if (resultado.duplicados > 0) {
    resultado.avisos.push(`${resultado.duplicados} registro(s) repetido(s) no lote; valeu a última ocorrência.`);
  }

  const buscar = db.prepare(
    `SELECT id, hash_conteudo, status, preco, valor_avaliacao, modalidade, praca_atual, gerado_na_fonte_em
     FROM imovel WHERE fonte_id = ? AND id_na_fonte = ?`,
  );
  const inserir = db.prepare(
    `INSERT INTO imovel (fonte_id, ${COLUNAS_IMOVEL.join(", ")}, primeira_vez_em, ultima_vez_em, atualizado_em, gerado_na_fonte_em, removido_em, hash_conteudo)
     VALUES (?, ${COLUNAS_IMOVEL.map(() => "?").join(", ")}, ?, ?, ?, ?, NULL, ?) RETURNING id`,
  );
  const atualizar = db.prepare(
    `UPDATE imovel SET ${COLUNAS_IMOVEL.map((c) => `${c} = ?`).join(", ")},
       ultima_vez_em = ?, atualizado_em = ?, gerado_na_fonte_em = ?, removido_em = NULL, hash_conteudo = ? WHERE id = ?`,
  );
  const tocar = db.prepare(`UPDATE imovel SET ultima_vez_em = ?, gerado_na_fonte_em = coalesce(?, gerado_na_fonte_em) WHERE id = ?`);
  const reativar = db.prepare(
    `UPDATE imovel SET status = ?, removido_em = NULL, ultima_vez_em = ?, gerado_na_fonte_em = coalesce(?, gerado_na_fonte_em) WHERE id = ?`,
  );
  const historico = db.prepare(
    `INSERT INTO preco_historico (imovel_id, coleta_id, registrado_em, evento, campos, preco, valor_avaliacao, modalidade, praca_atual, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  // geocode por endereço aplicado (base/geo/aplicado.ts): a coleta que regrava a linha com a sede não o apaga
  const geoGravado = db.prepare(`SELECT lat, lon, precisao_geo, extras FROM imovel WHERE id = ?`);
  const apagarPracas = db.prepare(`DELETE FROM praca WHERE imovel_id = ?`);
  const inserirPraca = db.prepare(`INSERT INTO praca (imovel_id, numero, data, valor_minimo) VALUES (?, ?, ?, ?)`);
  const fotosAtuais = db.prepare(`SELECT id, url FROM foto WHERE imovel_id = ?`);
  const upsertFoto = db.prepare(
    `INSERT INTO foto (imovel_id, url, ordem, tamanho, origem, verificada_em, ok) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (imovel_id, url) DO UPDATE SET ordem = excluded.ordem, tamanho = excluded.tamanho, origem = excluded.origem,
       ok = CASE WHEN excluded.verificada_em IS NOT NULL THEN excluded.ok ELSE foto.ok END,
       verificada_em = COALESCE(excluded.verificada_em, foto.verificada_em)`,
  );
  const verificarFoto = db.prepare(`UPDATE foto SET verificada_em = ?, ok = ? WHERE imovel_id = ? AND url = ?`);
  const apagarFoto = db.prepare(`DELETE FROM foto WHERE id = ?`);
  const docsAtuais = db.prepare(`SELECT id, url FROM documento WHERE imovel_id = ?`);
  const upsertDoc = db.prepare(
    `INSERT INTO documento (imovel_id, tipo, titulo, url, publicado_em) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (imovel_id, url) DO UPDATE SET tipo = excluded.tipo, titulo = excluded.titulo, publicado_em = excluded.publicado_em`,
  );
  const apagarDoc = db.prepare(`DELETE FROM documento WHERE id = ?`);

  const registrarHistorico = (imovelId: number, evento: string, campos: string[] | null, linha: Pick<LinhaImovel, "preco" | "valor_avaliacao" | "modalidade" | "praca_atual"> & { status: StatusImovel }): void => {
    historico.run(
      imovelId, coletaId, quando, evento, campos && campos.length > 0 ? campos.join(",") : null,
      linha.preco, linha.valor_avaliacao, linha.modalidade, linha.praca_atual, linha.status,
    );
  };

  const gravarFilhos = (imovelId: number, preparado: ImovelPreparado): void => {
    apagarPracas.run(imovelId);
    for (const p of preparado.pracas) inserirPraca.run(imovelId, p.numero, p.data, p.valor_minimo);

    const urlsFotos = new Set(preparado.fotos.map((f) => f.url));
    for (const atual of fotosAtuais.all(imovelId)) {
      if (!urlsFotos.has(String(atual.url))) apagarFoto.run(Number(atual.id));
    }
    for (const f of preparado.fotos) upsertFoto.run(imovelId, f.url, f.ordem, f.tamanho, f.origem, f.verificada_em, sqlBool(f.ok));

    const urlsDocs = new Set(preparado.documentos.map((d) => d.url));
    for (const atual of docsAtuais.all(imovelId)) {
      if (!urlsDocs.has(String(atual.url))) apagarDoc.run(Number(atual.id));
    }
    for (const d of preparado.documentos) upsertDoc.run(imovelId, d.tipo, d.titulo, d.url, d.publicado_em);
  };

  transacao(db, () => {
    const filtroUf = opcoes.escopoUf ? " AND uf = ?" : "";
    const parametrosEscopo: ValorSql[] = opcoes.escopoUf ? [fonteId, opcoes.escopoUf] : [fonteId];
    const ativosAntes = Number(
      db.prepare(`SELECT count(*) AS n FROM imovel WHERE fonte_id = ? AND status = 'ativo'${filtroUf}`).get(...parametrosEscopo)?.n ?? 0,
    );

    const alertasGeo: string[] = [];
    for (const [idNaFonte, imovel] of porId) {
      const preparado = prepararImovel(imovel, agora);
      if (preparado.alertaGeo) alertasGeo.push(`${idNaFonte}: ${preparado.alertaGeo}`);
      const linha = preparado.linha;
      const bruto = buscar.get(fonteId, idNaFonte);
      if (!bruto) {
        const novo = inserir.get(fonteId, ...valoresLinha(linha), quando, quando, quando, geradoEm, preparado.hash);
        const imovelId = Number(novo?.id);
        gravarFilhos(imovelId, preparado);
        registrarHistorico(imovelId, "novo", null, linha);
        resultado.novos++;
        continue;
      }
      const existente: Existente = {
        id: Number(bruto.id),
        hash: String(bruto.hash_conteudo),
        status: String(bruto.status) as StatusImovel,
        preco: lerNumero(bruto.preco),
        valor_avaliacao: lerNumero(bruto.valor_avaliacao),
        modalidade: String(bruto.modalidade),
        praca_atual: lerNumero(bruto.praca_atual),
      };
      if (loteMaisAntigo(geradoEm, lerTexto(bruto.gerado_na_fonte_em))) {
        resultado.antigos++;
        continue;
      }
      const estavaRemovido = existente.status === "removido";
      if (existente.hash === preparado.hash) {
        if (estavaRemovido) {
          reativar.run(linha.status, quando, geradoEm, existente.id);
          registrarHistorico(existente.id, "reativado", ["status"], linha);
          resultado.reativados++;
        } else {
          tocar.run(quando, geradoEm, existente.id);
          resultado.inalterados++;
        }
        for (const f of preparado.fotos) {
          if (f.verificada_em) verificarFoto.run(f.verificada_em, sqlBool(f.ok), existente.id, f.url);
        }
        continue;
      }
      let gravar = linha;
      if (linha.precisao_geo === "cidade") {
        const g = geoGravado.get(existente.id);
        const mantido = g
          ? manterGeocode(linha, { lat: lerNumero(g.lat), lon: lerNumero(g.lon), precisao_geo: lerTexto(g.precisao_geo), extras: lerTexto(g.extras) })
          : null;
        if (mantido) gravar = { ...linha, ...mantido };
      }
      atualizar.run(...valoresLinha(gravar), quando, quando, geradoEm, preparado.hash, existente.id);
      gravarFilhos(existente.id, preparado);
      const mudaram = CAMPOS_HISTORICO.filter((campo) => (existente[campo] ?? null) !== (linha[campo] ?? null));
      if (estavaRemovido) {
        registrarHistorico(existente.id, "reativado", mudaram.includes("status") ? mudaram : [...mudaram, "status"], linha);
        resultado.reativados++;
      } else {
        if (mudaram.length > 0) registrarHistorico(existente.id, "mudanca", mudaram, linha);
        resultado.atualizados++;
      }
    }

    if (resultado.antigos > 0) {
      resultado.avisos.push(`${resultado.antigos} imóvel(is) ignorado(s): o gravado veio de uma geração mais nova da fonte.`);
    }
    if (alertasGeo.length > 0) {
      const amostra = alertasGeo.slice(0, 5).join(" | ");
      resultado.avisos.push(`Geo: ${alertasGeo.length} imóvel(is) com alerta (${amostra}${alertasGeo.length > 5 ? " | ..." : ""}). Cidade nova vira apelido em base/geo/apelidos.csv.`);
    }
    if (!opcoes.completa) return;
    const vistos = new Set<string>([...porId.keys(), ...(opcoes.idsProtegidos ?? [])]);
    const candidatos = db
      .prepare(
        `SELECT id, id_na_fonte, preco, valor_avaliacao, modalidade, praca_atual, gerado_na_fonte_em, data_praca
         FROM imovel WHERE fonte_id = ? AND status = 'ativo'${filtroUf}`,
      )
      .all(...parametrosEscopo)
      .filter((linha) => !vistos.has(String(linha.id_na_fonte)))
      .filter((linha) => !loteMaisAntigo(geradoEm, lerTexto(linha.gerado_na_fonte_em)));
    // A trava conta só o que sumiu sem explicação: o lote cuja praça já passou (há mais de 1 dia) sumir
    // é o esperado (o leilão aconteceu; num leiloeiro, um evento inteiro sai do site de uma vez) e ele
    // já não aparece no site. Sem isso, o dia seguinte a um leilão grande travaria a remoção de vez.
    const limiteVencida = agora.getTime() - 24 * 3600 * 1000;
    const inesperados = candidatos.filter((linha) => {
      const t = lerTexto(linha.data_praca) ? instanteDe(String(linha.data_praca)) : null;
      return t === null || t >= limiteVencida;
    });
    const limite = opcoes.maxFracaoRemocao ?? 0.5;
    const fracao = ativosAntes > 0 ? inesperados.length / ativosAntes : 0;
    if (inesperados.length >= 10 && fracao > limite) {
      resultado.remocao = "bloqueada";
      resultado.avisos.push(
        `Remoção bloqueada: ${inesperados.length} de ${ativosAntes} ativos (${Math.round(fracao * 100)}%) sumiram antes da data da praça, acima do limite de ${Math.round(limite * 100)}%. Confira a fonte; nada foi marcado como removido.`,
      );
      return;
    }
    // A remoção carimba a geração que a justificou: um lote mais antigo não pode reativar.
    const remover = db.prepare(
      `UPDATE imovel SET status = 'removido', removido_em = ?, gerado_na_fonte_em = coalesce(?, gerado_na_fonte_em) WHERE id = ?`,
    );
    for (const c of candidatos) {
      const id = Number(c.id);
      remover.run(quando, geradoEm, id);
      registrarHistorico(id, "removido", ["status"], {
        preco: lerNumero(c.preco),
        valor_avaliacao: lerNumero(c.valor_avaliacao),
        modalidade: String(c.modalidade),
        praca_atual: lerNumero(c.praca_atual),
        status: "removido",
      });
      resultado.removidos++;
    }
  });
  return resultado;
}

// ---------------------------------------------------------------------------
// Gravação de editais (radar)
// ---------------------------------------------------------------------------

export interface ResultadoEditais {
  novos: number;
  atualizados: number;
  inalterados: number;
  avisos: string[];
}

/**
 * Arquivos do edital em JSON (coluna `documentos`), ou `null` quando a coleta não consultou
 * os arquivos (`undefined`/`null`): nesse caso o que já está gravado fica como está.
 */
function documentosDoEdital(documentos: readonly Documento[] | null | undefined): string | null {
  if (!Array.isArray(documentos)) return null;
  const vistos = new Set<string>();
  const lista = documentos
    .filter((d) => !vistos.has(d.url.trim()) && Boolean(vistos.add(d.url.trim())))
    .map((d) => ({
      tipo: d.tipo,
      titulo: d.titulo ? textoOuNulo(mascararDadosPessoais(semHtml(d.titulo))) : null,
      url: d.url.trim(),
      publicado_em: d.publicado_em ?? null,
    }));
  return JSON.stringify(lista);
}

/**
 * Grava editais de UMA fonte numa transação (upsert; editais não são removidos). Os
 * `documentos` só são trocados quando o edital normalizado os traz (a fonte foi consultada),
 * e o `site_leilao` só quando a coleta acha um (um trecho mais curto do mesmo aviso não apaga).
 */
export function gravarEditais(
  db: Banco,
  fonteId: string,
  editais: readonly EditalNormalizado[],
  opcoes: { agora?: Date } = {},
): ResultadoEditais {
  const quando = (opcoes.agora ?? new Date()).toISOString();
  const resultado: ResultadoEditais = { novos: 0, atualizados: 0, inalterados: 0, avisos: [] };
  const buscar = db.prepare(`SELECT id, hash_conteudo, documentos FROM edital WHERE fonte_id = ? AND id_na_fonte = ?`);
  const existeImovel = db.prepare(`SELECT 1 AS ok FROM imovel WHERE id = ?`);
  const inserir = db.prepare(
    `INSERT INTO edital (fonte_id, id_na_fonte, titulo, orgao, uf, cidade, cidade_norm, publicado_em, data_leilao, url, site_leilao, resumo, imovel_id, primeira_vez_em, ultima_vez_em, hash_conteudo, documentos)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const atualizar = db.prepare(
    `UPDATE edital SET titulo = ?, orgao = ?, uf = ?, cidade = ?, cidade_norm = ?, publicado_em = ?, data_leilao = ?, url = ?,
       site_leilao = COALESCE(?, site_leilao), resumo = ?, imovel_id = COALESCE(?, imovel_id), ultima_vez_em = ?, hash_conteudo = ?, documentos = COALESCE(?, documentos)
     WHERE id = ?`,
  );
  const tocar = db.prepare(`UPDATE edital SET ultima_vez_em = ? WHERE id = ?`);

  transacao(db, () => {
    for (const edital of editais) {
      const cidade = textoOuNulo(edital.cidade);
      let imovelId = edital.imovel_id ?? null;
      if (imovelId !== null && !existeImovel.get(imovelId)) {
        resultado.avisos.push(`Edital ${edital.id_na_fonte}: imovel_id ${imovelId} não existe; vínculo ignorado.`);
        imovelId = null;
      }
      const campos = {
        titulo: textoLimpo(edital.titulo)?.replace(/\s+/g, " ") ?? edital.id_na_fonte,
        orgao: edital.orgao ? textoOuNulo(mascararDocumentos(edital.orgao)) : null,
        uf: edital.uf ?? null,
        cidade,
        cidade_norm: cidade ? slug(cidade) : null,
        publicado_em: edital.publicado_em ?? null,
        data_leilao: edital.data_leilao ?? null,
        url: edital.url.trim(),
        site_leilao: edital.site_leilao?.trim() || null,
        resumo: edital.resumo ? (() => {
          const limpo = textoLimpo(edital.resumo);
          return limpo ? truncar(limpo, 2000) : null;
        })() : null,
      };
      const hash = hashEstavel({ ...campos, imovel_id: imovelId });
      // null = arquivos não consultados nesta coleta: mantém os gravados (COALESCE no UPDATE).
      const documentos = documentosDoEdital(edital.documentos);
      const atual = buscar.get(fonteId, edital.id_na_fonte.trim());
      if (!atual) {
        inserir.run(
          fonteId, edital.id_na_fonte.trim(), campos.titulo, campos.orgao, campos.uf, campos.cidade, campos.cidade_norm,
          campos.publicado_em, campos.data_leilao, campos.url, campos.site_leilao, campos.resumo, imovelId, quando, quando, hash, documentos,
        );
        resultado.novos++;
      } else if (lerTexto(atual.hash_conteudo) === hash && (documentos === null || documentos === lerTexto(atual.documentos))) {
        tocar.run(quando, Number(atual.id));
        resultado.inalterados++;
      } else {
        atualizar.run(
          campos.titulo, campos.orgao, campos.uf, campos.cidade, campos.cidade_norm, campos.publicado_em,
          campos.data_leilao, campos.url, campos.site_leilao, campos.resumo, imovelId, quando, hash, documentos, Number(atual.id),
        );
        resultado.atualizados++;
      }
    }
  });
  return resultado;
}

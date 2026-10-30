/**
 * Validador do JSONL dos leiloeiros, antes de importar:
 *
 *   npm run leiloeiros:validar -- --arquivo saida.jsonl [--json] [--sem-ibge] [--max 40]
 *   node --experimental-strip-types base/leiloeiros/validar.ts --arquivo saida.jsonl   (Windows/PowerShell)
 *
 * Confere cada linha contra o esquema (imovel.schema.json ou coleta.schema.json) e a coerência:
 * praças em ordem de data e com o mínimo da 2ª não maior que o da 1ª, praça atual que existe, UF
 * válida e cidade que casa com o IBGE (base/geo), lat/lon juntas e com precisão, ids repetidos, URLs,
 * e LGPD (CPF, RG, e-mail e nome depois de "executado:", "arrematante", "réu" e parecidos). Erro
 * impede a importação do lote; aviso é para corrigir no coletor. No fim, um resumo por leiloeiro com a
 * previsão da importação (a coleta do leiloeiro é recusada se mais de 2 lotes, ou de 5%, tiverem erro).
 *
 * Código de saída: 0 sem erros (avisos podem existir), 1 com erros, 2 uso incorreto.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { tabelaPadrao, type TabelaMunicipios } from "../geo/municipios.ts";
import { chaveNome } from "../geo/nomes.ts";
import { instanteDe } from "../util/data.ts";
import { mascararDocumentos, mascararNomes } from "../util/lgpd.ts";
import { comitentePareceEmpresaOuOrgao, lerJsonl, separarId, slugValido, VALOR_SIMBOLICO, valorInformado, type LinhaColeta, type LinhaImovel } from "./contrato.ts";
import { carregarEsquema, validarEsquema } from "./esquema.ts";
import { agregar, medidaDaLinha, pracaEmVigor, type Agregado } from "./medidas.ts";

export type Nivel = "erro" | "aviso";

export interface Problema {
  /** Linha do arquivo (0 = o arquivo ou o leiloeiro inteiro). */
  linha: number;
  nivel: Nivel;
  /** Campo ("endereco.cep", "pracas[1].data"), ou "linha"/"arquivo". */
  campo: string;
  mensagem: string;
  /** Leiloeiro da linha, quando se sabe. */
  slug?: string;
}

export interface OpcoesExame {
  agora?: Date;
  /** Tabela de municípios do IBGE para conferir a cidade; null pula a conferência. Padrão: a de base/geo. */
  tabela?: TabelaMunicipios | null;
}

const UM_DIA = 24 * 3600 * 1000;

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// ---------------------------------------------------------------------------
// LGPD
// ---------------------------------------------------------------------------

/** Campos que nunca levam texto livre de pessoa (ids, URLs, enums, controle): fora da varredura. */
const SEM_VARREDURA =
  /^(?:registro|versao_contrato|id|url|leiloeiro\.(?:slug|site)|situacao|tipo|modalidade|natureza|precisao_geo|processo|controle\..+|fotos\[\d+\]\.url|documentos\[\d+\]\.(?:url|tipo)|comitente\.tipo|ocupacao\.(?:situacao|origem)|debitos\.\w+\.responsavel|pracas\[\d+\]\.(?:data|situacao))$/;
/** Textos que o núcleo limpa e mascara ao gravar: nome aqui é aviso (corrija no coletor), não erro. */
const MASCARADOS_PELO_NUCLEO = /^(?:titulo|descricao|observacoes|leilao_titulo|ocupacao\.texto|debitos\.texto|pagamento\.texto|documentos\[\d+\]\.titulo)$/;
/** Campos de lugar e de quem vende: vão ao site sem a máscara de nomes. */
const CAMPOS_DE_LUGAR = /^(?:endereco\.(?:texto|logradouro|complemento|bairro)|registro_imovel\.cartorio|comitente\.nome)$/;
/** Papel de pessoa num campo de lugar ou de comitente ("Rua X, 10 - proprietário Fulano", "Exequente: Banco Y"). */
export const PAPEL_DE_PESSOA =
  /(?<![\p{L}])(?:propriet[áa]ri[oa]s?|executad[oa]s?|exequentes?|devedor(?:a|es|as)?|fiduciantes?|r[ée]us?|r[ée]s|autor(?:a|es|as)?|arrematantes?|depositári[oa]s?|ocupad[oa]s?\s+(?:por|pel[oa])|reside(?:m|nte)?|c[ôo]njuges?|herdeir[oa]s?|esp[óo]lio|em\s+face\s+de|em\s+nome\s+de|de\s+propriedade\s+de)(?![\p{L}])/iu;

function textosDe(valor: unknown, caminho: string, saida: Array<[string, string]>): void {
  if (typeof valor === "string") saida.push([caminho, valor]);
  else if (Array.isArray(valor)) valor.forEach((v, i) => textosDe(v, `${caminho}[${i}]`, saida));
  else if (ehObjeto(valor)) for (const [k, v] of Object.entries(valor)) textosDe(v, caminho ? `${caminho}.${k}` : k, saida);
}

/** Documentos mascarados num texto ("CPF", "E-MAIL"...), pela máscara do núcleo. */
function documentosNoTexto(texto: string): string[] {
  const mascarado = mascararDocumentos(texto);
  if (mascarado === texto) return [];
  return [...new Set([...mascarado.matchAll(/\[(CPF|CNPJ|RG|E-MAIL|IP)\]/g)].map((m) => m[1]!))].filter((d) => !texto.includes(`[${d}]`));
}

/**
 * O exame de LGPD de um texto, guardado por texto: numa carga, o mesmo comitente, bairro, rótulo de
 * modalidade ou título de documento se repete em milhares de lotes, e as máscaras de nome são a parte
 * cara da validação (uma carga de 50 mil lotes levava mais de um minuto).
 */
interface ExameTexto {
  documentos: string[];
  /** A máscara de nomes mudaria o texto (nome depois de um papel). */
  nome: boolean;
  /** Papel de pessoa (para campo de lugar), ou null. */
  papel: string | null;
}
const MAX_CACHE_LGPD = 50_000;
const cacheLgpd = new Map<string, ExameTexto>();

function examinarTexto(texto: string, comNome: boolean): ExameTexto {
  const chave = `${comNome ? "n" : "p"}\u0000${texto}`;
  const visto = cacheLgpd.get(chave);
  if (visto) return visto;
  const exame: ExameTexto = {
    documentos: documentosNoTexto(texto),
    nome: comNome ? mascararNomes(texto) !== texto : false,
    papel: comNome ? null : (PAPEL_DE_PESSOA.exec(texto)?.[0] ?? null),
  };
  if (cacheLgpd.size >= MAX_CACHE_LGPD) cacheLgpd.clear();
  cacheLgpd.set(chave, exame);
  return exame;
}

/** Problemas de LGPD de uma linha (qualquer formato). */
export function problemasLgpd(linha: unknown): Problema[] {
  const problemas: Problema[] = [];
  const textos: Array<[string, string]> = [];
  textosDe(linha, "", textos);
  for (const [campo, texto] of textos) {
    if (SEM_VARREDURA.test(campo)) continue;
    const mascarado = MASCARADOS_PELO_NUCLEO.test(campo);
    const deLeiloeiro = campo.startsWith("leiloeiro.");
    const deLugar = !deLeiloeiro && CAMPOS_DE_LUGAR.test(campo);
    const exame = examinarTexto(texto, !deLeiloeiro && !deLugar);
    for (const doc of exame.documentos) {
      const grave = !mascarado || doc === "CPF" || doc === "RG";
      problemas.push({
        linha: 0,
        nivel: grave ? "erro" : "aviso",
        campo,
        mensagem: `LGPD: o texto tem ${doc}${grave ? "; tire no coletor (nunca mande documento de pessoa)" : "; o núcleo mascara, mas tire no coletor"}`,
      });
    }
    if (deLeiloeiro) continue; // o leiloeiro é profissional público: o nome dele pode ir
    if (deLugar) {
      if (exame.papel) {
        problemas.push({ linha: 0, nivel: "erro", campo, mensagem: `LGPD: "${exame.papel}" sugere nome de pessoa num campo que vai ao site sem máscara; mande só o lugar` });
      }
    } else if (exame.nome) {
      problemas.push({
        linha: 0,
        nivel: "aviso",
        campo,
        mensagem: `LGPD: parece haver nome de pessoa depois de um papel (executado, arrematante, réu...)${mascarado ? "; o núcleo mascara, mas tire no coletor" : "; tire no coletor"}`,
      });
    }
  }
  return problemas;
}

// ---------------------------------------------------------------------------
// Uma linha
// ---------------------------------------------------------------------------

const ROTULO_PRACA = (n: number): string => (n === 0 ? "praça única" : `${n}ª praça`);

/** Coerência de uma linha de imóvel que já passou no esquema. */
function coerenciaImovel(l: LinhaImovel, opcoes: OpcoesExame): Problema[] {
  const p: Problema[] = [];
  const erro = (campo: string, mensagem: string): void => void p.push({ linha: 0, nivel: "erro", campo, mensagem });
  const aviso = (campo: string, mensagem: string): void => void p.push({ linha: 0, nivel: "aviso", campo, mensagem });
  const agora = opcoes.agora ?? new Date();

  const id = separarId(l.id);
  if (!id) erro("id", "id fora do padrão <slug>:<lote> (slug com minúsculas e hífens; lote só com letras minúsculas e dígitos)");
  else if (id.slug !== l.leiloeiro.slug) erro("id", `o slug do id (${id.slug}) é diferente de leiloeiro.slug (${l.leiloeiro.slug})`);

  // Praças
  const pracas = [...l.pracas].sort((a, b) => a.numero - b.numero);
  const numeros = new Set<number>();
  for (const praca of l.pracas) {
    if (numeros.has(praca.numero)) erro("pracas", `${ROTULO_PRACA(praca.numero)} repetida`);
    numeros.add(praca.numero);
  }
  if (numeros.has(0) && numeros.size > 1) erro("pracas", "praça 0 (única) junto com praças numeradas: use 0 só quando há uma praça");
  for (let k = 1; k < pracas.length; k++) {
    const antes = pracas[k - 1]!;
    const depois = pracas[k]!;
    const ta = antes.data ? instanteDe(antes.data) : null;
    const td = depois.data ? instanteDe(depois.data) : null;
    if (ta !== null && td !== null && td <= ta) erro("pracas", `a data da ${ROTULO_PRACA(depois.numero)} não é depois da ${ROTULO_PRACA(antes.numero)}`);
    if (antes.valor_minimo !== null && depois.valor_minimo !== null && depois.valor_minimo > antes.valor_minimo) {
      erro("pracas", `o valor mínimo da ${ROTULO_PRACA(depois.numero)} (${depois.valor_minimo}) é maior que o da ${ROTULO_PRACA(antes.numero)} (${antes.valor_minimo})`);
    }
  }
  if (l.praca_atual !== null && l.praca_atual !== undefined && !numeros.has(l.praca_atual)) erro("praca_atual", `a praça ${l.praca_atual} não está em pracas`);
  if (l.modalidade !== "leilao" && l.modalidade !== "outro" && pracas.some((x) => x.numero > 0)) {
    aviso("pracas", `${l.modalidade} não tem 1ª e 2ª praça: use uma praça com numero 0 (data = prazo, valor = preço)`);
  }

  // Coordenadas
  const temLat = l.lat !== null && l.lat !== undefined;
  const temLon = l.lon !== null && l.lon !== undefined;
  if (temLat !== temLon) erro("lat", "lat e lon vêm juntas (ou as duas null)");
  if (temLat && temLon && !l.precisao_geo) erro("precisao_geo", "coordenada sem precisao_geo (exata, rua, cep, bairro ou cidade)");

  // Situação, praça e lance
  const ativo = l.situacao === "ativo";
  const vigente = pracaEmVigor(l, agora);
  const lance = valorInformado(l.lance_minimo) ?? valorInformado(vigente?.valor_minimo);
  if (ativo) {
    const t = vigente?.data ? instanteDe(vigente.data) : null;
    if (t !== null && t < agora.getTime() - UM_DIA) {
      aviso("situacao", `ativo, mas a praça em vigor (${ROTULO_PRACA(vigente!.numero)}) já passou: sai do site; o coletor precisa trazer a situação nova (vendido, encerrado, 2ª praça)`);
    }
    if (lance === null) aviso("lance_minimo", "sem lance mínimo (nem em lance_minimo nem na praça em vigor): o lote não aparece no site");
  } else if (l.pracas.some((x) => x.situacao === "aberta" || x.situacao === "futura")) {
    aviso("situacao", `situação ${l.situacao}, mas há praça marcada como futura ou aberta`);
  }

  // Valores
  const simbolicos: [string, string, number | null | undefined][] = [
    ["avaliacao", "avaliacao", l.avaliacao],
    ["lance_minimo", "lance_minimo", l.lance_minimo],
    ...l.pracas.map((p): [string, string, number | null] => ["pracas", `valor_minimo da ${ROTULO_PRACA(p.numero)}`, p.valor_minimo]),
  ];
  for (const [campo, rotulo, v] of simbolicos) {
    if (typeof v === "number" && v > 0 && v < VALOR_SIMBOLICO) aviso(campo, `${rotulo} de R$ ${v}: valor simbólico ("a definir"); a Luneta trata como não informado. Mande null`);
  }
  if (l.avaliacao === 0) aviso("avaliacao", "avaliação 0: mande null quando a fonte não informa");
  if (l.avaliacao !== null && l.avaliacao !== undefined && l.avaliacao > 0 && l.avaliacao < 1000) aviso("avaliacao", `avaliação de R$ ${l.avaliacao}: confira a unidade (reais, não milhares)`);
  if (l.avaliacao && lance && lance > 3 * l.avaliacao) aviso("lance_minimo", "lance mais de 3 vezes a avaliação: erro de digitação ou de unidade?");

  // Natureza, processo e comitente
  if (l.natureza === "judicial" && !l.processo) aviso("processo", "leilão judicial sem o número do processo (CNJ)");
  if (l.natureza === "extrajudicial" && l.processo) aviso("processo", "processo num leilão extrajudicial: confira a natureza");
  if (l.comitente?.tipo === "judicial" && l.natureza === "extrajudicial") aviso("comitente.tipo", "comitente judicial num leilão extrajudicial");
  if (l.comitente?.tipo === "outro" && !comitentePareceEmpresaOuOrgao(l.comitente.nome)) {
    aviso("comitente.nome", "comitente do tipo outro sem cara de empresa, banco, vara ou órgão: pode ser pessoa física, e a importação o descarta (LGPD); se for empresa, use o tipo empresa");
  }

  // Endereço
  if (!l.endereco.texto?.trim() && !l.endereco.logradouro?.trim()) {
    aviso("endereco", "sem endereço (nem texto nem logradouro): o ponto fica na sede da cidade e não dá para achar o mesmo imóvel na Caixa pelo endereço");
  }
  if (opcoes.tabela !== null) {
    const tabela = opcoes.tabela ?? tabelaPadrao();
    const achado = tabela.encontrar(l.endereco.uf, l.endereco.cidade);
    if (achado && (achado.metodo === "apelido" || achado.metodo === "grafia") && chaveNome(achado.municipio.nome) !== chaveNome(l.endereco.cidade)) {
      aviso("endereco.cidade", `"${l.endereco.cidade}" é grafia antiga ou variante: o IBGE escreve "${achado.municipio.nome}" (a Luneta grava assim; mande assim)`);
    }
    if (!achado) {
      const sugestao = tabela.sugerir(l.endereco.uf, l.endereco.cidade);
      aviso(
        "endereco.cidade",
        `"${l.endereco.cidade}" não casa com um município do IBGE em ${l.endereco.uf}: fica fora do mapa`
          + (sugestao ? ` (quis dizer "${sugestao.nome}"?)` : "; confira a grafia ou acrescente um apelido em base/geo/apelidos.csv"),
      );
    }
  }

  // Ocupação
  if (l.ocupacao?.situacao && !l.ocupacao.origem) aviso("ocupacao.origem", "ocupação sem origem (campo ou texto): a Luneta não usa");
  if (l.ocupacao?.origem === "texto" && !l.ocupacao.texto?.trim()) aviso("ocupacao.texto", "ocupação achada no texto, mas sem o trecho em ocupacao.texto");

  // Fotos e documentos repetidos
  const fotos = l.fotos.map((f) => f.url);
  if (new Set(fotos).size < fotos.length) aviso("fotos", "URL de foto repetida");
  const docs = l.documentos.map((d) => d.url);
  if (new Set(docs).size < docs.length) aviso("documentos", "URL de documento repetida");
  return p;
}

/** Problemas de uma linha de imóvel: esquema, coerência e LGPD. */
export function examinarImovel(valor: unknown, opcoes: OpcoesExame = {}): Problema[] {
  const doEsquema: Problema[] = validarEsquema(valor, carregarEsquema("imovel")).map((e) => ({ linha: 0, nivel: "erro", campo: e.caminho, mensagem: e.mensagem }));
  const coerencia = doEsquema.length === 0 ? coerenciaImovel(valor as LinhaImovel, opcoes) : [];
  return [...doEsquema, ...coerencia, ...problemasLgpd(valor)];
}

/** Problemas de uma linha de coleta: esquema e coerência. */
export function examinarColeta(valor: unknown, opcoes: OpcoesExame = {}): Problema[] {
  const p: Problema[] = validarEsquema(valor, carregarEsquema("coleta")).map((e) => ({ linha: 0, nivel: "erro", campo: e.caminho, mensagem: e.mensagem }));
  if (p.length > 0) return p;
  const c = valor as LinhaColeta;
  const agora = opcoes.agora ?? new Date();
  const t = instanteDe(c.coletado_em);
  if (t !== null && t > agora.getTime() + 3600_000) p.push({ linha: 0, nivel: "erro", campo: "coletado_em", mensagem: "data de coleta no futuro: confira o fuso" });
  if (t !== null && t < agora.getTime() - 30 * UM_DIA) p.push({ linha: 0, nivel: "aviso", campo: "coletado_em", mensagem: "coleta de mais de 30 dias atrás" });
  if (c.completa && c.saude !== "ok") {
    p.push({ linha: 0, nivel: "erro", campo: "completa", mensagem: `completa=true com saúde ${c.saude}: uma carga só é completa quando o coletor leu tudo (saúde ok)` });
  }
  if (c.saude === "ok" && !c.completa) p.push({ linha: 0, nivel: "aviso", campo: "completa", mensagem: "saúde ok mas completa=false: o que sumir do site do leiloeiro continua no ar" });
  if (c.saude === "ok" && c.total_enviados === 0) p.push({ linha: 0, nivel: "aviso", campo: "total_enviados", mensagem: "saúde ok e nenhum lote: o leiloeiro não tem imóveis? (carga vazia não tira nada do ar)" });
  if ((c.saude === "quebrado" || c.saude === "bloqueado") && !c.erro) p.push({ linha: 0, nivel: "aviso", campo: "erro", mensagem: `saúde ${c.saude} sem a mensagem de erro` });
  if (c.completa && c.total_na_fonte && c.total_enviados < 0.8 * c.total_na_fonte) {
    p.push({ linha: 0, nivel: "aviso", campo: "total_enviados", mensagem: `completa, mas só ${c.total_enviados} de ${c.total_na_fonte} lotes que o site diz ter (filtro de imóveis? paginação?)` });
  }
  return p;
}

// ---------------------------------------------------------------------------
// O arquivo
// ---------------------------------------------------------------------------

export interface ResumoLeiloeiro {
  slug: string;
  nome: string | null;
  site: string | null;
  /** Da linha de coleta, senão a mais frequente nos lotes. */
  plataforma: string | null;
  lotes: number;
  lotesComErro: number;
  avisos: number;
  porSituacao: Record<string, number>;
  /** Medidas dos lotes sem erro. */
  agregado: Agregado;
  coleta: LinhaColeta | null;
  /** O que a importação faria com este leiloeiro. */
  importacao: string;
}

export interface ResultadoValidacao {
  linhas: number;
  linhasImovel: number;
  linhasColeta: number;
  erros: number;
  avisos: number;
  problemas: Problema[];
  leiloeiros: ResumoLeiloeiro[];
}

/** O valor mais frequente (nulos fora; empate: o primeiro em ordem alfabética), ou null. */
export function maisFrequente(valores: ReadonlyArray<string | null | undefined>): string | null {
  const contagem = new Map<string, number>();
  for (const v of valores) if (v) contagem.set(v, (contagem.get(v) ?? 0) + 1);
  return [...contagem].sort(([a, x], [b, y]) => y - x || a.localeCompare(b))[0]?.[0] ?? null;
}

/** Previsão da importação de um leiloeiro, pela regra do núcleo (base/coleta.ts). */
function previsaoImportacao(lotes: number, comErro: number, coleta: LinhaColeta | null, ilegiveis: number): string {
  if (lotes === 0) {
    if (!coleta) return "nada a importar";
    return coleta.saude === "quebrado" || coleta.saude === "bloqueado"
      ? `registrada como erro (${coleta.saude}); os lotes já publicados continuam no ar`
      : "nenhum lote: coleta inválida, nada muda na base";
  }
  const validos = lotes - comErro;
  if (validos === 0) return "RECUSADA: nenhum lote válido";
  if (comErro > Math.max(2, lotes * 0.05)) return `RECUSADA: ${comErro} de ${lotes} lotes com erro (limite: 2 ou 5%); nada deste leiloeiro seria gravado`;
  const remocao = !coleta
    ? "sem linha de coleta: nada sai do site por ter sumido"
    : !coleta.completa || coleta.saude !== "ok"
      ? "carga incompleta: nada sai do site por ter sumido"
      : comErro > 0
        ? "remoção desligada nesta carga (há lotes com erro)"
        : ilegiveis > 0
          ? `remoção desligada nesta carga (${ilegiveis} linha(s) do arquivo sem leiloeiro reconhecível: JSON quebrado, registro desconhecido ou sem slug)`
          : "o que sumiu desde a última carga sai do site";
  return `grava ${validos} lote(s)${comErro ? ` e ignora ${comErro}` : ""}; ${remocao}`;
}

/** Valida o conteúdo de um JSONL inteiro. */
export function validarJsonl(texto: string, opcoes: OpcoesExame = {}): ResultadoValidacao {
  const agora = opcoes.agora ?? new Date();
  const problemas: Problema[] = [];
  if (texto.includes("�")) {
    problemas.push({ linha: 0, nivel: "erro", campo: "arquivo", mensagem: "o arquivo não está em UTF-8 (há caracteres trocados por �): salve como UTF-8" });
  }
  const linhas = lerJsonl(texto);
  if (linhas.length === 0) problemas.push({ linha: 0, nivel: "erro", campo: "arquivo", mensagem: "arquivo vazio" });

  const ids = new Map<string, number>();
  const coletas = new Map<string, { linha: number; valor: LinhaColeta }>();
  const identidade = new Map<string, { nome: string; site: string; avisado: boolean }>();
  const lotes = new Map<string, Array<{ linha: number; valor: unknown; ok: boolean }>>();
  let linhasImovel = 0;
  let linhasColeta = 0;
  /** Linhas que a importação não atribui a nenhum leiloeiro: desligam a remoção de todos (base/fontes/leiloeiros). */
  let ilegiveis = 0;

  const conferirIdentidade = (slug: string, leiloeiro: unknown, numero: number): void => {
    if (!ehObjeto(leiloeiro) || typeof leiloeiro.nome !== "string" || typeof leiloeiro.site !== "string") return;
    const vista = identidade.get(slug);
    if (!vista) identidade.set(slug, { nome: leiloeiro.nome, site: leiloeiro.site, avisado: false });
    else if (!vista.avisado && (vista.nome !== leiloeiro.nome || vista.site !== leiloeiro.site)) {
      vista.avisado = true;
      problemas.push({ linha: numero, nivel: "aviso", campo: "leiloeiro", mensagem: `nome ou site do leiloeiro ${slug} diferente das linhas anteriores (vale o da linha de coleta)`, slug });
    }
  };

  for (const lida of linhas) {
    if (lida.erro !== undefined) {
      problemas.push({ linha: lida.numero, nivel: "erro", campo: "linha", mensagem: lida.erro });
      ilegiveis++;
      continue;
    }
    const valor = lida.valor;
    const registro = ehObjeto(valor) ? valor.registro : undefined;
    const leiloeiro = ehObjeto(valor) && ehObjeto(valor.leiloeiro) ? valor.leiloeiro : undefined;
    const slugDeclarado = leiloeiro?.slug;
    const slug = slugValido(slugDeclarado) ? slugDeclarado : (separarId(ehObjeto(valor) ? valor.id : undefined)?.slug ?? undefined);
    if (registro === "imovel") {
      linhasImovel++;
      const doLote = examinarImovel(valor, { ...opcoes, agora }).map((x) => ({ ...x, linha: lida.numero, slug }));
      const id = ehObjeto(valor) && typeof valor.id === "string" ? valor.id : null;
      if (id !== null) {
        const anterior = ids.get(id);
        if (anterior !== undefined) doLote.push({ linha: lida.numero, nivel: "erro", campo: "id", mensagem: `id repetido (já usado na linha ${anterior})`, slug });
        else ids.set(id, lida.numero);
      }
      problemas.push(...doLote);
      if (slug) {
        conferirIdentidade(slug, leiloeiro, lida.numero);
        let doSlug = lotes.get(slug);
        if (!doSlug) lotes.set(slug, (doSlug = []));
        doSlug.push({ linha: lida.numero, valor, ok: !doLote.some((x) => x.nivel === "erro") });
      } else ilegiveis++;
    } else if (registro === "coleta") {
      linhasColeta++;
      const daColeta = examinarColeta(valor, { ...opcoes, agora }).map((x) => ({ ...x, linha: lida.numero, slug }));
      if (slug) {
        const anterior = coletas.get(slug);
        if (anterior) daColeta.push({ linha: lida.numero, nivel: "erro", campo: "registro", mensagem: `segunda linha de coleta do leiloeiro ${slug} (a primeira está na linha ${anterior.linha})`, slug });
        else if (!daColeta.some((x) => x.nivel === "erro")) coletas.set(slug, { linha: lida.numero, valor: valor as unknown as LinhaColeta });
        conferirIdentidade(slug, leiloeiro, lida.numero);
      } else ilegiveis++;
      problemas.push(...daColeta);
    } else {
      ilegiveis++;
      problemas.push({ linha: lida.numero, nivel: "erro", campo: "registro", mensagem: `registro deve ser "imovel" ou "coleta", veio ${JSON.stringify(registro) ?? "nada"}` });
    }
  }

  const slugs = [...new Set([...lotes.keys(), ...coletas.keys()])].sort();
  const leiloeiros: ResumoLeiloeiro[] = slugs.map((slug) => {
    const doLeiloeiro = lotes.get(slug) ?? [];
    const coleta = coletas.get(slug)?.valor ?? null;
    if (doLeiloeiro.length > 0 && !coleta) {
      problemas.push({ linha: 0, nivel: "aviso", campo: "registro", mensagem: `${slug}: sem linha de coleta; na importação nada deste leiloeiro sai do site por ter sumido da carga`, slug });
    }
    if (coleta && coleta.total_enviados !== doLeiloeiro.length) {
      problemas.push({ linha: coletas.get(slug)!.linha, nivel: "aviso", campo: "total_enviados", mensagem: `total_enviados = ${coleta.total_enviados}, mas o arquivo tem ${doLeiloeiro.length} lote(s) de ${slug}`, slug });
    }
    const validos = doLeiloeiro.filter((x) => x.ok).map((x) => x.valor as LinhaImovel);
    const porSituacao: Record<string, number> = {};
    for (const l of validos) porSituacao[l.situacao] = (porSituacao[l.situacao] ?? 0) + 1;
    const comErro = doLeiloeiro.length - validos.length;
    return {
      slug,
      nome: coleta?.leiloeiro.nome ?? identidade.get(slug)?.nome ?? null,
      site: coleta?.leiloeiro.site ?? identidade.get(slug)?.site ?? null,
      plataforma: coleta?.plataforma ?? maisFrequente(validos.map((l) => l.plataforma ?? null)),
      lotes: doLeiloeiro.length,
      lotesComErro: comErro,
      avisos: 0, // contado abaixo, depois dos avisos do leiloeiro inteiro
      porSituacao,
      agregado: agregar(validos.map((l) => medidaDaLinha(l, agora))),
      coleta,
      importacao: previsaoImportacao(doLeiloeiro.length, comErro, coleta, ilegiveis),
    };
  });
  const avisosPorSlug = new Map<string, number>();
  for (const x of problemas) if (x.nivel === "aviso" && x.slug) avisosPorSlug.set(x.slug, (avisosPorSlug.get(x.slug) ?? 0) + 1);
  for (const r of leiloeiros) r.avisos = avisosPorSlug.get(r.slug) ?? 0;

  return {
    linhas: linhas.length,
    linhasImovel,
    linhasColeta,
    erros: problemas.filter((x) => x.nivel === "erro").length,
    avisos: problemas.filter((x) => x.nivel === "aviso").length,
    problemas,
    leiloeiros,
  };
}

// ---------------------------------------------------------------------------
// Saída legível
// ---------------------------------------------------------------------------

const NOME_SITUACAO: Readonly<Record<string, string>> = {
  ativo: "ativo(s)",
  suspenso: "suspenso(s)",
  encerrado: "encerrado(s)",
  vendido: "vendido(s)",
  cancelado: "cancelado(s)",
};

function pct(v: number | null): string {
  return v === null ? "–" : `${v}%`;
}

/** Resumo legível do resultado (para o terminal). */
export function formatarResultado(r: ResultadoValidacao, opcoes: { arquivo?: string; maxProblemas?: number } = {}): string {
  const max = opcoes.maxProblemas ?? 40;
  const saida: string[] = [];
  saida.push(`Arquivo: ${opcoes.arquivo ?? "(texto)"}: ${r.linhas} linha(s), ${r.linhasColeta} de coleta e ${r.linhasImovel} de imóvel`);
  saida.push(
    r.erros === 0
      ? `Resultado: OK para importar (${r.avisos} aviso(s))`
      : `Resultado: ${r.erros} erro(s) e ${r.avisos} aviso(s). Lote com erro não entra; corrija o coletor e valide de novo`,
  );
  for (const l of r.leiloeiros) {
    saida.push("");
    saida.push(`${l.slug} · ${l.nome ?? "(sem nome)"}${l.site ? ` · ${l.site}` : ""}`);
    if (l.coleta) {
      const c = l.coleta;
      saida.push(
        `  coleta: saúde ${c.saude}, ${c.completa ? "completa" : "incompleta"}, em ${c.coletado_em}`
          + `${c.frequencia ? `, ${c.frequencia}` : ""}${c.plataforma ? `, plataforma ${c.plataforma}` : ""}`
          + `, ${c.total_enviados} lote(s) enviados${c.total_na_fonte !== null && c.total_na_fonte !== undefined ? ` de ${c.total_na_fonte} na fonte` : ""}`
          + (c.erro ? `; erro: ${c.erro}` : ""),
      );
    } else saida.push("  coleta: sem linha de coleta");
    const situacoes = Object.entries(l.porSituacao).map(([s, n]) => `${n} ${NOME_SITUACAO[s] ?? s}`).join(", ");
    saida.push(`  lotes: ${l.lotes}${situacoes ? ` (${situacoes})` : ""} · ${l.lotesComErro} com erro · ${l.avisos} aviso(s)`);
    const a = l.agregado;
    const fora = a.situacao.praca_vencida + a.situacao.sem_lance;
    saida.push(`  no site: ${a.ativos}${a.leiloes_ativos ? ` em ${a.leiloes_ativos} leilão(ões)` : ""}${fora ? ` (fora: ${a.situacao.praca_vencida} com praça vencida, ${a.situacao.sem_lance} sem lance)` : ""}`);
    if (a.ativos > 0) {
      const q = a.qualidade;
      saida.push(
        `  qualidade dos que vão ao site: foto ${pct(q.com_foto_pct)} · edital ${pct(q.com_edital_pct)} · avaliação ${pct(q.com_avaliacao_pct)}`
          + ` · área ${pct(q.com_area_pct)} · endereço com número ${pct(q.com_endereco_completo_pct)} · praça com data ${pct(q.com_praca_datada_pct)}`,
      );
      saida.push(`  por UF: ${Object.entries(a.por_uf).map(([k, n]) => `${k} ${n}`).join(", ")} · por tipo: ${Object.entries(a.por_tipo).map(([k, n]) => `${k} ${n}`).join(", ")}`);
    }
    saida.push(`  importação: ${l.importacao}`);
  }
  for (const nivel of ["erro", "aviso"] as const) {
    const lista = r.problemas.filter((x) => x.nivel === nivel);
    if (lista.length === 0) continue;
    saida.push("");
    saida.push(nivel === "erro" ? "Erros (linha · campo: mensagem):" : "Avisos (linha · campo: mensagem):");
    for (const x of lista.slice(0, max)) saida.push(`  ${x.linha || "-"} · ${x.campo}: ${x.mensagem}`);
    if (lista.length > max) saida.push(`  (+${lista.length - max} omitidos; use --max para ver mais)`);
  }
  return saida.join("\n");
}

// ---------------------------------------------------------------------------
// Linha de comando
// ---------------------------------------------------------------------------

const AJUDA = `Valida o JSONL dos coletores dos leiloeiros (contrato em base/leiloeiros/CONTRATO.md).

Uso: npm run leiloeiros:validar -- --arquivo saida.jsonl [--json] [--sem-ibge] [--max 40] [--agora 2026-10-27T12:00:00Z]
 (no Windows: node --experimental-strip-types base/leiloeiros/validar.ts --arquivo saida.jsonl)

  --json       resultado completo em JSON (para outro programa ler)
  --sem-ibge   não confere a cidade na tabela do IBGE
  --max N      quantos erros e avisos mostrar (padrão 40)
  --agora ISO  data de referência (praça vencida, coleta no futuro); padrão: agora`;

export function principal(argv: readonly string[], saida: (t: string) => void = (t) => process.stdout.write(t + "\n"), erro: (t: string) => void = (t) => process.stderr.write(t + "\n")): number {
  let v: { arquivo?: string; json?: boolean; "sem-ibge"?: boolean; max?: string; agora?: string; ajuda?: boolean };
  try {
    v = parseArgs({
      args: [...argv],
      strict: true,
      options: {
        arquivo: { type: "string" },
        json: { type: "boolean" },
        "sem-ibge": { type: "boolean" },
        max: { type: "string" },
        agora: { type: "string" },
        ajuda: { type: "boolean", short: "h" },
      },
    }).values;
  } catch (e) {
    erro(`${(e as Error).message}\n\n${AJUDA}`);
    return 2;
  }
  if (v.ajuda) {
    saida(AJUDA);
    return 0;
  }
  if (!v.arquivo) {
    erro(`Informe o arquivo: --arquivo saida.jsonl\n\n${AJUDA}`);
    return 2;
  }
  const agora = v.agora ? new Date(v.agora) : new Date();
  if (Number.isNaN(agora.getTime())) {
    erro(`--agora inválido: ${v.agora}`);
    return 2;
  }
  const max = v.max ? Number(v.max) : 40;
  if (!Number.isInteger(max) || max < 0) {
    erro(`--max precisa ser um inteiro: ${v.max}`);
    return 2;
  }
  const caminho = resolve(v.arquivo);
  let texto: string;
  try {
    texto = readFileSync(caminho, "utf8");
  } catch (e) {
    erro(`Não li ${caminho}: ${(e as Error).message}`);
    return 2;
  }
  const r = validarJsonl(texto, { agora, tabela: v["sem-ibge"] ? null : undefined });
  saida(v.json ? JSON.stringify(r, null, 2) : formatarResultado(r, { arquivo: caminho, maxProblemas: max }));
  return r.erros > 0 ? 1 : 0;
}

const executadoDireto = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (executadoDireto) process.exitCode = principal(process.argv.slice(2));

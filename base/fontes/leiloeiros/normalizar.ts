/**
 * Linha de imóvel do JSONL dos leiloeiros (base/leiloeiros/CONTRATO.md) → ImovelNormalizado.
 *
 * A linha passa antes pelo mesmo exame do validador (`examinarImovel`, sem a tabela do IBGE): erro
 * de esquema, de coerência ou de LGPD lança erro, e o núcleo conta o lote como inválido. Depois:
 * - endereço, bairro, cartório e comitente passam por `campoSemPessoa` (o núcleo não mascara nomes
 *   nessas colunas, e elas vão ao site): campo com cara de pessoa é descartado;
 * - dívidas declaradas e comissão viram frases curtas em `textos` (origem "campo:debitos" e
 *   "campo:comissao_pct"), para as regras de tag que já existem lerem; o site mostra essas frases como
 *   "campo da fonte", sem aspas;
 * - parcelas, entrada e índice vão para os extras que o site usa na frase de pagamento
 *   (nu_parcelas, vl_percentualentrada, indice_correcao), e o site do leiloeiro em site_leiloeiro;
 * - nada que muda a cada coleta (versão do coletor, data da leitura, hash) entra nos extras: mudaria o
 *   hash do imóvel e faria tudo parecer atualizado.
 */
import type { Documento, Foto, ImovelNormalizado, NumeroPraca, Praca, TextoFonte } from "../../tipos.ts";
import { mascararDadosPessoais, mascararDocumentos } from "../../util/lgpd.ts";
import { formatarMoedaBR } from "../../util/numero.ts";
import { normalizarUf } from "../../util/uf.ts";
import { colapsarEspacos, textoOuNulo } from "../../util/texto.ts";
import { comitentePareceEmpresaOuOrgao, enderecoEmTexto, separarId, type DebitoLinha, type LinhaImovel } from "../../leiloeiros/contrato.ts";
import { examinarImovel } from "../../leiloeiros/validar.ts";
import { campoSemPessoa } from "../leiloesjudiciais/normalizar.ts";
import { tabelaPadrao } from "../../geo/municipios.ts";

/** Quantos problemas a mensagem de erro de um lote mostra. */
const PROBLEMAS_NA_MENSAGEM = 3;

/**
 * Campo de texto que vai ao site sem a máscara de nomes (endereço, bairro, cartório, comitente): cortado
 * onde começa uma pessoa ("Banco X, credor fiduciário" → "Banco X"), ou descartado se ainda tiver cara
 * de nome. É a mesma regra da Leilões Judiciais.
 */
function semPessoa(valor: string | null | undefined): string | null {
  const texto = textoOuNulo(valor);
  const limpo = campoSemPessoa(texto);
  if (!texto || limpo === null) return null;
  // sem corte, fica o texto como veio (campoSemPessoa também tira a pontuação do fim: "S.A." → "S.A")
  return limpo === texto.replace(/[\s.,;:(–—-]+$/u, "") ? texto : limpo;
}

/** Matrícula e inscrição: só números e separadores; com documento de pessoa, nada. */
function semDocumento(valor: string | null | undefined): string | null {
  const texto = textoOuNulo(valor);
  return texto && mascararDocumentos(texto) === texto ? texto : null;
}

const NOME_DIVIDA = { iptu: "IPTU", condominio: "condomínio" } as const;
const QUEM_PAGA: Readonly<Record<string, string>> = {
  arrematante: "por conta do arrematante",
  pago_com_o_lance: "pago com o valor do lance (sub-roga-se no preço)",
  vendedor: "a cargo do vendedor",
};

/** "Débito de IPTU declarado pelo leiloeiro: R$ 8.500,00, por conta do arrematante." (as regras de dívida leem). */
export function fraseDebito(tipo: "iptu" | "condominio", d: DebitoLinha | null | undefined): string | null {
  if (!d || (d.valor === null && d.responsavel === null)) return null;
  const valor = d.valor !== null ? `: ${formatarMoedaBR(d.valor)}` : " (valor não informado)";
  const quem = d.responsavel ? `, ${QUEM_PAGA[d.responsavel]}` : "";
  return `Débito de ${NOME_DIVIDA[tipo]} declarado pelo leiloeiro${valor}${quem}.`;
}

function semNulos(extras: Record<string, string | number | boolean | null | undefined>): Record<string, string | number | boolean> {
  const saida: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(extras)) if (v !== null && v !== undefined && v !== "") saida[k] = v;
  return saida;
}

/**
 * Cidade como o IBGE escreve quando a da fonte é o mesmo município com outra grafia ("SÃO PAULO",
 * "Sao Paulo", "Moji das Cruzes", "Embu"): o filtro de cidade do site não se divide em duas. Distrito
 * ("Taguatinga") e cidade que não casa ficam como vieram.
 */
export function cidadeOficial(uf: string, cidade: string): string {
  const limpa = colapsarEspacos(cidade);
  const achado = tabelaPadrao().encontrar(uf, limpa);
  return achado && (achado.metodo === "nome" || achado.metodo === "apelido" || achado.metodo === "grafia") ? achado.municipio.nome : limpa;
}

/** ISO com fuso → ISO UTC (a convenção da base). */
function emUtc(data: string | null): string | null {
  if (!data) return null;
  const t = new Date(data);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

/** Converte uma linha de imóvel; lança erro se ela não passa no exame do contrato. */
export function normalizarLinha(bruto: unknown): ImovelNormalizado {
  const erros = examinarImovel(bruto, { tabela: null }).filter((p) => p.nivel === "erro");
  if (erros.length > 0) {
    const lista = erros.slice(0, PROBLEMAS_NA_MENSAGEM).map((e) => `${e.campo}: ${e.mensagem}`).join("; ");
    const id = typeof (bruto as { id?: unknown })?.id === "string" ? `${(bruto as { id: string }).id}: ` : "";
    throw new Error(`${id}${lista}${erros.length > PROBLEMAS_NA_MENSAGEM ? ` (+${erros.length - PROBLEMAS_NA_MENSAGEM})` : ""}`);
  }
  const l = bruto as LinhaImovel;
  const { lote } = separarId(l.id)!;
  const uf = normalizarUf(l.endereco.uf);
  if (!uf) throw new Error(`${l.id}: UF inválida`);

  const textos: TextoFonte[] = [];
  const texto = (origem: string, valor: string | null | undefined): void => {
    const t = textoOuNulo(valor);
    if (t) textos.push({ origem, texto: t });
  };
  texto("titulo_leilao", l.leilao_titulo);
  texto("observacoes", l.observacoes);
  texto("ocupacao", l.ocupacao?.origem === "texto" ? l.ocupacao.texto : null);
  texto("debitos", l.debitos?.texto);
  texto("pagamento", l.pagamento?.texto);
  const dividas = [fraseDebito("iptu", l.debitos?.iptu), fraseDebito("condominio", l.debitos?.condominio)].filter((f): f is string => f !== null);
  texto("campo:debitos", dividas.join(" ") || null);
  if (l.comissao_pct !== null && l.comissao_pct !== undefined) {
    const pct = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(l.comissao_pct);
    texto("campo:comissao_pct", `Comissão do leiloeiro: ${pct}% sobre o valor do lance.`);
  }

  const pracas: Praca[] = [...l.pracas]
    .sort((a, b) => a.numero - b.numero)
    .map((p) => ({ numero: p.numero as NumeroPraca, data: emUtc(p.data), valor_minimo: p.valor_minimo }));
  // Praça em vigor: a que o coletor diz, senão a primeira marcada como futura ou aberta; sem isso, o núcleo
  // deduz pelas datas (a primeira que não passou).
  const pelaSituacao = [...l.pracas].sort((a, b) => a.numero - b.numero).find((p) => p.situacao === "aberta" || p.situacao === "futura");
  const declarada = l.praca_atual ?? pelaSituacao?.numero ?? undefined;
  const situacoesPraca: Record<string, string | null> = {};
  for (const p of l.pracas) situacoesPraca[`praca_${p.numero}_situacao`] = p.situacao ?? null;

  const fotos: Foto[] = l.fotos.map((f, i) => ({ url: f.url.trim(), ordem: f.ordem ?? i, origem: "ficha" }));
  const documentos: Documento[] = l.documentos.map((d) => ({
    tipo: d.tipo === "processo" ? "outro" : d.tipo,
    titulo: textoOuNulo(d.titulo) ?? (d.tipo === "processo" ? "Processo" : null),
    url: d.url.trim(),
  }));

  // Extras da fonte: só valores simples, sem dado pessoal (descartados se a máscara mudar algo).
  const daFonte: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(l.extras ?? {})) {
    if (typeof v === "string") {
      const limpo = colapsarEspacos(v);
      if (limpo && mascararDadosPessoais(limpo) === limpo) daFonte[`x_${k}`] = limpo;
    } else daFonte[`x_${k}`] = v;
  }

  const pagamento = l.pagamento ?? {};
  return {
    registro: "imovel",
    id_na_fonte: lote,
    url: l.url.trim(),
    titulo: l.titulo,
    tipo: l.tipo,
    uf,
    cidade: cidadeOficial(uf, l.endereco.cidade),
    bairro: semPessoa(l.endereco.bairro),
    endereco: semPessoa(enderecoEmTexto(l.endereco)),
    cep: l.endereco.cep ? l.endereco.cep.replace(/\D/g, "") : null,
    lat: l.lat ?? null,
    lon: l.lon ?? null,
    precisao_geo: l.lat !== null && l.lat !== undefined ? (l.precisao_geo ?? null) : null,
    area_privativa: l.area_privativa ?? null,
    area_total: l.area_total ?? null,
    area_terreno: l.area_terreno ?? null,
    quartos: l.quartos ?? null,
    vagas: l.vagas ?? null,
    descricao: l.descricao ?? null,
    textos,
    modalidade: l.modalidade,
    modalidade_fonte: textoOuNulo(l.modalidade_fonte),
    judicial: l.natureza === "judicial" ? true : l.natureza === "extrajudicial" ? false : null,
    aceita_financiamento: pagamento.financiamento ?? null,
    aceita_fgts: pagamento.fgts ?? null,
    aceita_parcelamento: pagamento.parcelamento ?? null,
    ocupacao: l.ocupacao?.origem === "campo" ? l.ocupacao.situacao : null,
    leiloeiro: l.leiloeiro.nome,
    // tipo "outro" sem cara de empresa ou órgão pode ser pessoa física: fica fora (o comitente vai ao site sem máscara)
    comitente: l.comitente && (l.comitente.tipo !== "outro" || comitentePareceEmpresaOuOrgao(l.comitente.nome)) ? semPessoa(l.comitente.nome) : null,
    numero_processo: l.processo ?? null,
    matricula: semDocumento(l.registro_imovel?.matricula),
    cartorio: semPessoa(l.registro_imovel?.cartorio),
    valor_avaliacao: l.avaliacao ?? null,
    preco: l.lance_minimo ?? undefined,
    praca_atual: declarada as NumeroPraca | undefined,
    pracas,
    fotos,
    documentos,
    status: l.situacao === "ativo" ? "ativo" : "encerrado",
    extras: semNulos({
      ...daFonte,
      leiloeiro_slug: l.leiloeiro.slug,
      site_leiloeiro: l.leiloeiro.site,
      leiloeiro_junta: textoOuNulo(l.leiloeiro.matricula_junta),
      plataforma: textoOuNulo(l.plataforma),
      comitente_tipo: l.comitente?.tipo ?? null,
      leilao_id: textoOuNulo(l.leilao_id),
      lote_numero: textoOuNulo(l.lote_numero),
      situacao: l.situacao,
      status_fonte: textoOuNulo(l.situacao_fonte),
      tipo_fonte: textoOuNulo(l.tipo_fonte),
      lance_atual: l.lance_atual ?? null,
      incremento: l.incremento ?? null,
      comissao_pct: l.comissao_pct ?? null,
      aceita_a_vista: pagamento.a_vista ?? null,
      nu_parcelas: pagamento.parcelas_max ?? null,
      vl_percentualentrada: pagamento.entrada_pct ?? null,
      indice_correcao: textoOuNulo(pagamento.indice_correcao),
      ocupacao_declarada: l.ocupacao?.situacao ?? null,
      ocupacao_origem: l.ocupacao?.situacao ? (l.ocupacao.origem ?? null) : null,
      debito_iptu_valor: l.debitos?.iptu?.valor ?? null,
      debito_iptu_responsavel: l.debitos?.iptu?.responsavel ?? null,
      debito_condominio_valor: l.debitos?.condominio?.valor ?? null,
      debito_condominio_responsavel: l.debitos?.condominio?.responsavel ?? null,
      inscricao_imobiliaria: semDocumento(l.registro_imovel?.inscricao_municipal),
      ...situacoesPraca,
    }),
  };
}

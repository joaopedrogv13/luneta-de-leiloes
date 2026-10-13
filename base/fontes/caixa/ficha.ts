/**
 * Parser da ficha do imóvel na Caixa (`/sistema/detalhe-imovel.asp?hdnimovel=N`).
 *
 * Testado em duas fichas reais (fixtures/): Venda Online de 2023 e Venda Direta Online de 2026.
 * Os rótulos de leilão ("Data do 1º Leilão", "Valor mínimo de venda 1º Leilão", "Data da
 * Licitação Aberta", "Leiloeiro(a):", "Edital:", "Valor de venda:", "Valor mínimo de venda à
 * vista:") vêm de parsers e índices de terceiros e NÃO foram vistos em HTML real: o parser os
 * aceita em formas tolerantes, mas eles precisam ser conferidos na primeira ficha de Leilão
 * SFI ou Licitação Aberta que for baixada.
 *
 * Tudo o que está dentro de comentário HTML é descartado antes de ler: a ficha traz
 * "Situação: Desocupado" só num comentário (em fichas de 2023 e 2026), o que não é dado
 * publicado e não pode virar ocupação. Fotos comentadas também são ignoradas.
 *
 * LGPD: a ficha de Leilão SFI tem texto livre (descrição, avisos de ação judicial e penhora)
 * que pode citar devedor fiduciante ou outra parte. Todo campo de texto sai daqui já
 * mascarado (mascararFicha), porque a ficha é guardada no cache local, fora do núcleo.
 *
 * Lista de documentos: a ficha só traz o link da matrícula. Os editais e anexos ficam em
 * /sistema/carregaListaDocumentos.asp, um POST AJAX atrás do anti-robô, que a coleta NÃO
 * chama (a verificação do catálogo recomendou não contornar). extrairDocumentos sabe ler
 * essa lista (testado na página real), mas nenhum edital entra pela coleta hoje.
 */
import type { Documento } from "../../tipos.ts";
import { lerDataBR, lerDataHoraBR } from "../../util/data.ts";
import { mascararDadosPessoais, mascararDocumentos } from "../../util/lgpd.ts";
import { lerInteiro, lerNumeroBR } from "../../util/numero.ts";
import { colapsarEspacos, decodificarEntidades, normalizarTexto, semHtml, textoOuNulo } from "../../util/texto.ts";
import { marcaDeDesafio } from "./lista.ts";

export const BASE_CAIXA = "https://venda-imoveis.caixa.gov.br";

export interface PracaFicha {
  numero: 1 | 2;
  /** ISO UTC (com hora) ou "AAAA-MM-DD". */
  data: string | null;
  valor_minimo: number | null;
}

export interface FichaCaixa {
  /** Título da ficha (ex.: "TERRENO", "COND ACONCHEGO DE ANGRA II"). */
  titulo: string | null;
  /** Número do imóvel com 13 dígitos (sem o traço do dígito verificador). */
  numero_imovel: string | null;
  tipo_imovel: string | null;
  quartos: number | null;
  vagas: number | null;
  /** Matrículas como aparecem (pode haver mais de uma). */
  matriculas: string[];
  /** "CRUZEIRO DO SUL-AC". */
  comarca: string | null;
  /** Ofício do registro de imóveis ("01"). */
  oficio: string | null;
  /** `null` quando a ficha diz "Não identificado". */
  inscricao_imobiliaria: string | null;
  /** Ex.: "Averbado". */
  averbacao_leiloes_negativos: string | null;
  valor_avaliacao: number | null;
  /**
   * "Valor mínimo de venda" (oferta única), ou "Valor mínimo de venda à vista", ou, sem
   * nenhum dos dois, "Valor de venda" (rótulos de ficha SFI vistos em índice de terceiro).
   */
  valor_minimo: number | null;
  /** "Valor de venda", quando a ficha mostra (pode ser diferente do mínimo à vista). */
  valor_venda?: number | null;
  /** Desconto que a ficha mostra (informativo; a base calcula o seu). */
  desconto_ficha: number | null;
  area_total: number | null;
  area_privativa: number | null;
  area_terreno: number | null;
  /** Endereço como na ficha, sem o CEP e sem a cidade/estado do fim. */
  endereco: string | null;
  /** 8 dígitos. */
  cep: string | null;
  /** Descrição livre da ficha (`null` quando é só "."). */
  descricao: string | null;
  formas_pagamento: string | null;
  regras_despesas: string | null;
  regra_condominio: string | null;
  regra_tributos: string | null;
  aceita_financiamento: boolean | null;
  aceita_fgts: boolean | null;
  aceita_parcelamento: boolean | null;
  aceita_consorcio: boolean | null;
  pracas: PracaFicha[];
  /** Data da Licitação Aberta, quando houver. */
  data_licitacao: string | null;
  leiloeiro: string | null;
  edital: string | null;
  numero_item: string | null;
  /** URLs absolutas das fotos publicadas na galeria, na ordem. */
  fotos: string[];
  /** A página tem a galeria de fotos (para distinguir "sem fotos" de "não li"). */
  tem_galeria: boolean;
  documentos: Documento[];
  /** Texto visível do bloco do imóvel (descrição, pagamento, despesas), para as regras de risco. */
  texto: string;
}

export class ErroFicha extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroFicha";
  }
}

/**
 * Motivo, se a página for um desafio anti-robô em vez da ficha. Uma página com o bloco de
 * dados do imóvel nunca é recusada por isso (o site pode carregar script de terceiros com
 * esses nomes em páginas normais).
 */
export function fichaBloqueada(html: string): string | null {
  if (/<div[^>]+id=["']dadosImovel["']/i.test(html)) return null;
  const marca = marcaDeDesafio(html);
  return marca ? `página de desafio anti-robô (${marca})` : null;
}

/** Remove comentários, scripts, estilos e noscript: só sobra o que a página mostra. */
function semOculto(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1\s*>/gi, " ");
}

function absoluta(caminho: string): string {
  const limpo = decodificarEntidades(caminho.trim());
  if (/^https?:\/\//i.test(limpo)) return limpo;
  return BASE_CAIXA + (limpo.startsWith("/") ? limpo : `/${limpo}`);
}

/** Bloco entre `<div id="dadosImovel"` e a galeria (ou o fim do formulário). */
function blocoDoImovel(html: string): string | null {
  const inicio = html.search(/<div[^>]+id=["']dadosImovel["']/i);
  if (inicio < 0) return null;
  const resto = html.slice(inicio);
  const fim = resto.search(/<div[^>]+id=["']galeria-imagens["']|<\/form>/i);
  return fim > 0 ? resto.slice(0, fim) : resto;
}

/** Pares "Rótulo: <strong>valor</strong>" e "Rótulo = <strong>valor</strong>" do bloco. */
function paresRotulados(bloco: string): Map<string, string> {
  const pares = new Map<string, string>();
  const regex = /<span[^>]*>\s*([^<>]{2,80}?)\s*[:=]\s*<strong>([\s\S]*?)<\/strong>/gi;
  for (const m of bloco.matchAll(regex)) {
    const rotulo = normalizarTexto(m[1] ?? "");
    const valor = colapsarEspacos(semHtml(m[2] ?? ""));
    if (rotulo && !pares.has(rotulo)) pares.set(rotulo, valor);
  }
  return pares;
}

function valorDe(pares: Map<string, string>, ...prefixos: string[]): string | null {
  for (const [rotulo, valor] of pares) {
    if (prefixos.some((p) => rotulo.startsWith(p))) return textoOuNulo(valor);
  }
  return null;
}

/** Área "600,00m2" → 600; ausente ou abaixo de 1 m² (marcador) → null. */
function lerAreaFicha(valor: string | null): number | null {
  const n = lerNumeroBR(valor ?? undefined, { decimal: "," });
  return n !== null && n >= 1 ? n : null;
}

/** Texto do parágrafo que segue um rótulo em <strong> ("Endereço:", "Descrição:"). */
function paragrafoApos(bloco: string, rotulo: RegExp): string | null {
  const m = new RegExp(`<strong>\\s*${rotulo.source}\\s*:?\\s*<\\/strong>\\s*(?:<br\\s*\\/?>)?([\\s\\S]*?)<\\/p>`, "i").exec(bloco);
  return m ? textoOuNulo(semHtml(m[1] ?? "")) : null;
}

/** Recorta o texto entre um rótulo e o primeiro dos fins, mantendo as quebras de linha. */
function trechoApos(texto: string, inicio: RegExp, fins: RegExp): string | null {
  const m = inicio.exec(texto);
  if (!m) return null;
  const resto = texto.slice(m.index + m[0].length);
  const fim = resto.search(fins);
  const trecho = (fim >= 0 ? resto.slice(0, fim) : resto).replace(/^[\s:]+/, "").trim();
  return trecho === "" ? null : trecho;
}

/** Linha que começa com o rótulo ("Condomínio: ..."), sem o rótulo. */
function linhaDe(trecho: string | null, rotulo: RegExp): string | null {
  if (!trecho) return null;
  const m = new RegExp(`(?:^|\\n)\\s*${rotulo.source}\\s*:\\s*([^\\n]+)`, "i").exec(trecho);
  return m ? textoOuNulo(m[1]) : null;
}

/**
 * Sim/não de uma forma de pagamento, pelo texto normalizado. Negação explícita vence
 * ("Imóvel NÃO aceita financiamento"), depois a afirmação explícita ("Permite utilização de
 * FGTS"); sem nenhuma das duas, vale a regra geral (`negadoPelaRegraGeral`: "exclusivamente à
 * vista" nega financiamento e parcelamento; "somente recursos próprios" nega também o FGTS).
 */
function flagPagamento(t: string, termo: string, negadoPelaRegraGeral: boolean): boolean | null {
  if (new RegExp(`(nao (aceita|permite|e permitid[oa]|admite)|sem (possibilidade de )?)[^.;]{0,40}${termo}`).test(t)) return false;
  if (new RegExp(`(aceita|permite|admite|possibilidade de|e permitid[oa])[^.;]{0,40}${termo}`).test(t)) return true;
  return negadoPelaRegraGeral ? false : null;
}

/** Data e hora de um trecho "08/06/2026 - 10h00", "08/06/2026 às 10:00" ou só a data. */
function lerDataLeilao(trecho: string): string | null {
  const m = /(\d{2}\/\d{2}\/\d{4})(?:\s*(?:[-–,]|as|às)?\s*(?:as|às)?\s*(\d{1,2})\s*(?:h|:)\s*(\d{2})?)?/i.exec(trecho);
  if (!m) return null;
  if (m[2] === undefined) return lerDataBR(m[1]);
  return lerDataHoraBR(`${m[1]} ${m[2]}:${m[3] ?? "00"}`);
}

/**
 * Documentos linkados na página: matrícula e editais abertos por `ExibeDoc('/editais/...')`
 * (ficha) e por `abredocumentoEdital("X.PDF")` (lista de documentos e, talvez, fichas de leilão).
 */
export function extrairDocumentos(html: string): Documento[] {
  const limpo = semOculto(html);
  const docs: Documento[] = [];
  const vistos = new Set<string>();
  const incluir = (doc: Documento): void => {
    if (vistos.has(doc.url)) return;
    vistos.add(doc.url);
    docs.push(doc);
  };
  for (const m of limpo.matchAll(/<a\b[^>]*ExibeDoc\(\s*['"]([^'"]+)['"]\s*\)[^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = absoluta(m[1] ?? "");
    const matricula = /\/editais\/matricula\//i.test(url);
    const titulo = matricula ? "Matrícula do imóvel" : (textoOuNulo(semHtml(m[2] ?? "")) ?? "Edital");
    incluir({ tipo: matricula ? "matricula" : "edital", titulo, url });
  }
  for (const m of limpo.matchAll(/<a\b[^>]*abredocumento(Edital)?\(\s*["']([^"']+)["']\s*\)[^>]*>([\s\S]*?)<\/a>([\s\S]{0,400}?)(?=<a\b|<\/li>|$)/gi)) {
    const arquivo = m[2] ?? "";
    const url = absoluta(`/editais/${m[1] ? "" : "anexos/"}${arquivo}`);
    const titulo = textoOuNulo(semHtml(m[3] ?? "")) ?? arquivo;
    const publicado = /publicado em:?\s*(\d{2}\/\d{2}\/\d{4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?)/i.exec(semHtml(m[4] ?? ""))?.[1];
    incluir({ tipo: "edital", titulo, url, publicado_em: publicado ? lerDataHoraBR(publicado) : null });
  }
  return docs;
}

/**
 * Lê a ficha. Lança ErroFicha se a página não for uma ficha (desafio anti-robô, página de
 * erro, imóvel que saiu do ar) ou se faltar o valor de avaliação (layout mudou).
 */
export function interpretarFicha(html: string): FichaCaixa {
  const bloqueio = fichaBloqueada(html);
  if (bloqueio) throw new ErroFicha(`Ficha recusada: ${bloqueio}.`);
  const visivel = semOculto(html);
  const bloco = blocoDoImovel(visivel);
  if (!bloco) throw new ErroFicha("Ficha recusada: a página não tem o bloco de dados do imóvel (saiu do ar ou mudou o layout).");
  const texto = semHtml(bloco);
  const t = normalizarTexto(texto);

  const avaliacao = /Valor de avalia[çc][ãa]o:?\s*R\$\s*([\d.]+,\d{2})/i.exec(texto);
  if (!avaliacao) throw new ErroFicha("Ficha recusada: sem \"Valor de avaliação\" (layout mudou?).");
  // "Valor mínimo de venda:" (fichas reais) ou "... à vista:"; "Valor de venda:" só na falta deles.
  const minimo = /Valor m[íi]nimo de venda(?:\s+[àa]\s+vista)?\s*:?\s*R\$\s*([\d.]+,\d{2})/i.exec(texto);
  const venda = /\bValor de venda\s*:?\s*R\$\s*([\d.]+,\d{2})/i.exec(texto);
  const desconto = /desconto de\s*([\d.,]+)\s*%/i.exec(texto);

  const pares = paresRotulados(bloco);
  const numero = valorDe(pares, "numero do imovel");
  const numeroDigitos = numero ? numero.replace(/\D/g, "") : "";
  // Sem o número não dá para conferir que a ficha é do imóvel pedido: recusa.
  if (numeroDigitos.length < 4 || numeroDigitos.length > 13) {
    throw new ErroFicha("Ficha recusada: sem \"Número do imóvel\" legível (layout mudou?).");
  }
  const matriculas = (valorDe(pares, "matricula") ?? "")
    .split(/\s*(?:,|;|\be\b|\/)\s*/)
    .map((m) => m.trim())
    .filter((m) => /\d/.test(m));
  const inscricao = valorDe(pares, "inscricao imobiliaria");

  const enderecoCompleto = paragrafoApos(bloco, /Endere[çc]o/);
  const cep = enderecoCompleto ? /CEP:?\s*(\d{2})\.?(\d{3})-?(\d{3})/i.exec(enderecoCompleto) : null;
  const endereco = enderecoCompleto
    ? textoOuNulo(colapsarEspacos(enderecoCompleto.replace(/\s*-?\s*\bCEP\b:?[\s\S]*$/i, "")).replace(/[\s,-]+$/, ""))
    : null;
  const descricao = paragrafoApos(bloco, /Descri[çc][ãa]o/);

  const fimPagamento = /REGRAS PARA PAGAMENTO|Corretores credenciados|Regras da Venda Online|Fazer uma proposta|Im[óo]vel N[ÃA]O aceita/i;
  const formas = trechoApos(texto, /FORMAS DE PAGAMENTO ACEITAS:?/i, fimPagamento);
  const despesas = trechoApos(texto, /REGRAS PARA PAGAMENTO DAS DESPESAS(?:\s*\(caso existam\))?:?/i, /Corretores credenciados|Regras da Venda Online|Fazer uma proposta/i);
  const regraCondominio = linhaDe(despesas, /Condom[íi]nio/);
  const regraTributos = linhaDe(despesas, /Tributos/);

  const soAVista = /exclusivamente a vista/.test(t);
  const soRecursosProprios = /somente recursos proprios/.test(t);
  const aceitaFinanciamento = flagPagamento(t, "financiamento", soAVista || soRecursosProprios);
  const aceitaFgts = flagPagamento(t, "(utilizacao de |uso de |uso do )?fgts", soRecursosProprios);
  const aceitaParcelamento = flagPagamento(t, "parcelamento", soAVista);
  const aceitaConsorcio = flagPagamento(t, "consorcio", soAVista || soRecursosProprios);

  // Praças do leilão e data da licitação (rótulos não confirmados em HTML real; ver topo).
  const pracas: PracaFicha[] = [];
  for (const n of [1, 2] as const) {
    const data = new RegExp(`Data d[oa] ${n}\\s*[º°ªo]?\\s*(?:Leil[ãa]o|Pra[çc]a)\\s*[-–:]?\\s*((?:(?!Data d)[\\s\\S]){0,60})`, "i").exec(texto);
    const valor = new RegExp(`Valor m[íi]nimo de venda (?:no |do )?${n}\\s*[º°ªo]?\\s*(?:Leil[ãa]o|Pra[çc]a):?\\s*R\\$\\s*([\\d.]+,\\d{2})`, "i").exec(texto);
    const dataLida = data ? lerDataLeilao(data[1] ?? "") : null;
    const valorLido = valor ? lerNumeroBR(valor[1], { decimal: "," }) : null;
    if (dataLida || valorLido !== null) pracas.push({ numero: n, data: dataLida, valor_minimo: valorLido });
  }
  const licitacao = /Data da Licita[çc][ãa]o(?: Aberta)?\s*[-–:]?\s*((?:(?!Data d)[\s\S]){0,60})/i.exec(texto);

  const fotos: string[] = [];
  for (const m of visivel.matchAll(/\/fotos\/F\d+\.(?:jpe?g|png|webp)/gi)) {
    const url = absoluta(m[0]);
    if (!fotos.includes(url)) fotos.push(url);
  }

  const valorVenda = venda ? lerNumeroBR(venda[1], { decimal: "," }) : null;
  return mascararFicha({
    titulo: textoOuNulo(semHtml(/<h5\b[^>]*>([\s\S]*?)<\/h5>/i.exec(bloco)?.[1] ?? "")),
    numero_imovel: numeroDigitos.padStart(13, "0"),
    tipo_imovel: valorDe(pares, "tipo de imovel"),
    quartos: lerInteiro(valorDe(pares, "quartos")),
    vagas: lerInteiro(valorDe(pares, "garagem", "vagas")),
    matriculas,
    comarca: valorDe(pares, "comarca"),
    oficio: valorDe(pares, "oficio"),
    inscricao_imobiliaria: inscricao && !/^nao (identificad|informad)/.test(normalizarTexto(inscricao)) ? inscricao : null,
    averbacao_leiloes_negativos: valorDe(pares, "averbacao dos leiloes negativos", "averbacao"),
    valor_avaliacao: lerNumeroBR(avaliacao[1], { decimal: "," }),
    valor_minimo: minimo ? lerNumeroBR(minimo[1], { decimal: "," }) : valorVenda,
    valor_venda: valorVenda,
    desconto_ficha: desconto ? lerNumeroBR(desconto[1], { decimal: "," }) : null,
    area_total: lerAreaFicha(valorDe(pares, "area total")),
    area_privativa: lerAreaFicha(valorDe(pares, "area privativa", "area util")),
    area_terreno: lerAreaFicha(valorDe(pares, "area do terreno")),
    endereco,
    cep: cep ? `${cep[1]}${cep[2]}${cep[3]}` : null,
    descricao: descricao && /[\p{L}\d]/u.test(descricao) ? descricao.replace(/(\s*\.)+\s*$/, ".") : null,
    formas_pagamento: formas ? colapsarEspacos(formas) : null,
    regras_despesas: despesas ? colapsarEspacos(despesas) : null,
    regra_condominio: regraCondominio,
    regra_tributos: regraTributos,
    aceita_financiamento: aceitaFinanciamento,
    aceita_fgts: aceitaFgts,
    aceita_parcelamento: aceitaParcelamento,
    aceita_consorcio: aceitaConsorcio,
    pracas,
    data_licitacao: licitacao ? lerDataLeilao(licitacao[1] ?? "") : null,
    leiloeiro: textoOuNulo(/Leiloeiro\(a\)\s*:\s*([^\n]{2,120}?)(?=\s+Data d|\n|$)/i.exec(texto)?.[1]),
    edital: textoOuNulo(/\bEdital\s*:\s*([^\n]{2,80}?)(?=\s+N[úu]mero do item|\n|$)/i.exec(texto)?.[1]),
    numero_item: textoOuNulo(/N[úu]mero do item\s*:\s*(\d+)/i.exec(texto)?.[1]),
    fotos,
    tem_galeria: /id=["']galeria-imagens["']/i.test(visivel),
    documentos: extrairDocumentos(html),
    texto: textoRelevante(texto),
  });
}

// ---------------------------------------------------------------------------
// LGPD e fichas degradadas
// ---------------------------------------------------------------------------

function mascararOuNulo(valor: string | null | undefined): string | null {
  return valor ? textoOuNulo(mascararDadosPessoais(valor)) : null;
}

/**
 * Mascara os textos livres da ficha (nomes de partes, CPF/CNPJ, RG, e-mail, IP) e os
 * documentos pessoais no leiloeiro e no endereço. Idempotente. interpretarFicha já devolve
 * a ficha mascarada; o cache passa de novo por aqui ao gravar (e ao migrar fichas antigas).
 */
export function mascararFicha(ficha: FichaCaixa): FichaCaixa {
  return {
    ...ficha,
    titulo: mascararOuNulo(ficha.titulo),
    descricao: mascararOuNulo(ficha.descricao),
    formas_pagamento: mascararOuNulo(ficha.formas_pagamento),
    regras_despesas: mascararOuNulo(ficha.regras_despesas),
    regra_condominio: mascararOuNulo(ficha.regra_condominio),
    regra_tributos: mascararOuNulo(ficha.regra_tributos),
    leiloeiro: ficha.leiloeiro ? textoOuNulo(mascararDocumentos(ficha.leiloeiro)) : null,
    endereco: ficha.endereco ? textoOuNulo(mascararDocumentos(ficha.endereco)) : null,
    documentos: ficha.documentos.map((d) => (d.titulo ? { ...d, titulo: mascararOuNulo(d.titulo) } : d)),
    texto: mascararDadosPessoais(ficha.texto ?? ""),
  };
}

/** Campos estáveis da ficha (não mudam com a oferta) e o nome usado nos avisos. */
const ESTAVEIS = [
  ["matriculas", "matrícula"],
  ["comarca", "comarca"],
  ["oficio", "ofício"],
  ["cep", "CEP"],
  ["inscricao_imobiliaria", "inscrição imobiliária"],
  ["endereco", "endereço"],
  ["tipo_imovel", "tipo de imóvel"],
  ["area_total", "área total"],
  ["area_privativa", "área privativa"],
  ["area_terreno", "área do terreno"],
] as const satisfies ReadonlyArray<readonly [keyof FichaCaixa, string]>;

function vazio(valor: unknown): boolean {
  return valor === null || valor === undefined || valor === "" || (Array.isArray(valor) && valor.length === 0);
}

/** A ficha não tem nenhum dos dados que toda ficha real tem (matrícula, comarca, CEP). */
export function fichaSemDadosEstaveis(ficha: FichaCaixa): boolean {
  return ficha.matriculas.length === 0 && !ficha.comarca && !ficha.cep;
}

/**
 * Nova leitura de uma ficha que perdeu campos estáveis que a anterior tinha (layout mudou,
 * página parcial): mantém os valores anteriores campo a campo, inclusive o PDF da
 * matrícula, e diz o que foi herdado. Uma ficha nunca apaga dado bom de uma leitura anterior.
 */
export function herdarEstaveis(anterior: FichaCaixa | null | undefined, nova: FichaCaixa): { ficha: FichaCaixa; herdados: string[] } {
  if (!anterior) return { ficha: nova, herdados: [] };
  const ficha: FichaCaixa = { ...nova, documentos: [...nova.documentos] };
  const herdados: string[] = [];
  const copia = ficha as unknown as Record<string, unknown>;
  const velha = anterior as unknown as Record<string, unknown>;
  for (const [campo, nome] of ESTAVEIS) {
    if (vazio(copia[campo]) && !vazio(velha[campo])) {
      copia[campo] = structuredClone(velha[campo]);
      herdados.push(nome);
    }
  }
  const matriculaPdf = anterior.documentos.find((d) => d.tipo === "matricula");
  if (matriculaPdf && !ficha.documentos.some((d) => d.tipo === "matricula")) {
    ficha.documentos.unshift({ ...matriculaPdf });
    herdados.push("PDF da matrícula");
  }
  return { ficha, herdados };
}

/** Do texto do bloco, só o que interessa às regras: descrição, pagamento, despesas e avisos. */
function textoRelevante(texto: string): string {
  const inicio = texto.search(/Descri[çc][ãa]o:/i);
  const corpo = inicio >= 0 ? texto.slice(inicio) : texto;
  return corpo
    .replace(/Corretores credenciados[\s\S]*$/i, "")
    .replace(/Regras da Venda Online[\s\S]*$/i, "")
    .trim();
}

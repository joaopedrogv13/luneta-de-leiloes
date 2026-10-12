/**
 * Filtro "é leilão de imóvel?" do radar de editais.
 *
 * Os quatro radares trazem muito mais do que leilão de imóvel: o PNCP mistura imóveis com
 * veículos e sucata na mesma modalidade, o DJEN traz citações e intimações por edital, o DOU
 * seção 3 traz todo tipo de aviso e o Querido Diário devolve diários inteiros. Este módulo
 * decide, só pelo texto, se o aviso é de leilão (ou praça/hasta pública) de bem imóvel.
 *
 * Como decide (texto sem HTML, minúsculas, sem acento):
 * 1. Precisa de sinal de leilão: "leilão", "leiloeiro", "hasta pública", "1ª/2ª praça",
 *    "praça única", "arrematação/arrematante". No PNCP a modalidade já é leilão
 *    (`leilaoGarantido`).
 * 2. Concessão, permissão ou cessão de uso, locação e arrendamento sem menção a venda ou
 *    alienação ficam de fora: não é compra do imóvel.
 * 3. Aceita com um sinal forte de imóvel (imóvel, terreno, lote urbano, lote/quadra,
 *    edificação, apartamento, casa, sala comercial, galpão, fazenda, gleba, chácara, sítio,
 *    prédio, unidade autônoma, vaga de garagem, hectares, domínio útil...) mesmo que o edital
 *    também tenha bens móveis (leilão misto).
 * 4. Sem sinal forte, aceita com dois sinais fracos (área total/privativa, metragem em m²,
 *    matrícula, benfeitorias, loja, sala nº, IPTU) desde que não haja sinal de bem móvel.
 *
 * Os falsos amigos conhecidos têm exceção: "Fazenda Nacional/Pública", "Ministério da
 * Fazenda", "Casa Civil", "casa de leilões", "sítio eletrônico", "praça" como logradouro
 * (só conta com ordinal: "1ª praça"), "lote" de leilão (só conta "lote urbano", "lote de
 * terreno" ou "lote 12 da quadra 3"). É heurística e está coberta por testes com textos
 * reais (amostras arquivadas) e construídos; na dúvida, prefere descartar.
 */
import { dobrarCaixaEAcento, semHtml } from "../../util/texto.ts";

export interface Sinal {
  /** Nome curto do sinal, ex.: "apartamento". */
  rotulo: string;
  /** Posição no texto analisado (`AnaliseLeilaoImovel.texto`). */
  inicio: number;
  fim: number;
}

export interface AnaliseLeilaoImovel {
  /** É leilão de imóvel. */
  aceito: boolean;
  /** Explicação curta da decisão (vai para logs e testes). */
  motivo: string;
  /** Texto analisado: o original sem HTML (as posições dos sinais valem nele). */
  texto: string;
  leilao: Sinal[];
  imovelForte: Sinal[];
  imovelFraco: Sinal[];
  /** Sinais de bem móvel (veículo, sucata, semovente...). */
  moveis: Sinal[];
  /** Concessão/locação sem venda. */
  usoSemVenda: Sinal[];
}

export interface OpcoesFiltro {
  /** A fonte já garante que é leilão (ex.: modalidade "Leilão" no PNCP). */
  leilaoGarantido?: boolean;
}

type Regra = readonly [rotulo: string, regex: RegExp];

const SINAIS_LEILAO: readonly Regra[] = [
  ["leilão", /\bleil(?:ao|oes)\b/g],
  ["leiloeiro", /\bleiloeir[oa]s?\b/g],
  ["hasta pública", /\bhastas?\s+publicas?\b/g],
  ["praça", /(?:\b[123]\s*(?:ª|º|°|a|o)?\s*|\b(?:primeira|segunda|terceira)\s+)(?:praca|hasta)\b/g],
  ["praça única", /\bpraca\s+unica\b/g],
  ["arrematação", /\barremata(?:cao|coes|nte|ntes)\b/g],
];

/** Órgãos e expressões com "fazenda" que não são imóvel rural. */
const FAZENDA = new RegExp(
  "(?<!\\b(?:ministerio|secretaria|procuradoria|receita|juizo|vara|sefaz|superintendencia|delegacia|departamento|coordenacao|subsecretaria|conselho|tesouro|controladoria)(?:\\s+[a-z]+){0,3}\\s+da\\s+)" +
    "\\bfazendas?\\b(?!\\s+(?:nacional|publica|estadual|municipal|federal|do\\s+estado|do\\s+municipio|da\\s+uniao|distrital))",
  "g",
);

const SINAIS_IMOVEL_FORTE: readonly Regra[] = [
  ["imóvel", /\bimove(?:l|is)\b/g],
  ["terreno", /\bterrenos?\b/g],
  ["lote urbano", /\blotes?\s+(?:urbanos?|de\s+terras?|de\s+terrenos?|residenciais|residencial|comerciais|comercial|rurais|rural)\b/g],
  ["lote e quadra", /\blotes?\s+(?:n[º°o]?\.?\s*)?\d+[a-z]?\s*(?:,\s*|\s+)(?:d[ao]\s+)?quadras?\b/g],
  ["edificação", /\bedifica(?:cao|coes)\b/g],
  ["apartamento", /\bapartamentos?\b|\baptos?\.?\s*(?:n[º°o]?\.?\s*)?\d/g],
  ["casa", /\bcasas?\b(?!\s+(?:civil|militar|da\s+moeda|de\s+leiloes|de\s+leilao|legislativa|de\s+custodia|de\s+detencao|bancaria|loterica|de\s+cambio))/g],
  ["sala comercial", /\bsalas?\s+comercia(?:l|is)\b/g],
  ["galpão", /\bgalp(?:ao|oes)\b/g],
  ["fazenda", FAZENDA],
  ["gleba", /\bglebas?\b/g],
  ["chácara", /\bchacaras?\b/g],
  ["sítio", /\bsitios?\b(?!\s+(?:eletronic|oficia|institucional|da\s+internet|na\s+internet|na\s+rede|www|https?|do\s+(?:orgao|tribunal|leiloeiro|banco|municipio|ministerio|pncp)|de\s+internet))/g],
  ["prédio", /\bpredios?\b|\bedificios?\b/g],
  ["unidade autônoma", /\bunidades?\s+autonomas?\b/g],
  ["vaga de garagem", /\bvagas?\s+(?:de\s+)?garage(?:m|ns)\b/g],
  ["área rural", /\bhectares?\b|\balqueires?\b/g],
  ["domínio útil", /\bdominio\s+util\b|\baforamento\b|\bterrenos?\s+de\s+marinha\b/g],
];

const SINAIS_IMOVEL_FRACO: readonly Regra[] = [
  ["área", /\bareas?\s+(?:total|construida|privativa|util|comum|de\s+terras?|do\s+terreno|territorial|real)\b/g],
  ["metragem", /\b\d+(?:[.,]\d+)*\s*(?:m2|m²|metros?\s+quadrados?)/g],
  ["matrícula", /\bmatriculas?\s+(?:sob\s+o\s+)?(?:n[º°o]?s?\.?\s*)?\d/g],
  ["benfeitorias", /\bbenfeitorias?\b/g],
  ["loja", /\blojas?\b(?!\s+(?:virtual|online|on-line|maconica))/g],
  ["sala", /\bsalas?\s+(?:n[º°o]?\.?\s*)?\d+/g],
  ["IPTU", /\biptu\b|\binscricao\s+imobiliaria\b/g],
];

const SINAIS_MOVEIS: readonly Regra[] = [
  ["veículo", /\bveiculos?\b|\bautomove(?:l|is)\b|\bmotocicletas?\b|\bcaminh(?:ao|oes|onetes?)\b|\bonibus\b|\breboques?\b|\bsemirreboques?\b|\btratores?\b/g],
  ["sucata", /\bsucatas?\b/g],
  ["bens móveis", /\bbens\s+(?:moveis|inserviveis|permanentes)\b|\binserviveis\b/g],
  ["semoventes", /\bsemoventes?\b|\bbovinos?\b|\bequinos?\b|\bgado\b/g],
  // "Eletrônico" sozinho não: "leilão eletrônico" é a forma do leilão, não o bem.
  ["mercadorias", /\bmercadorias?\b|\bmateriais\b|\bequipamentos?\b|\bmaquin(?:as|ario|arios)\b|\bmobiliarios?\b|\bcomputadores?\b|\beletro(?:eletronicos?|domesticos?|portateis)\b/g],
  ["aeronaves", /\baeronaves?\b|\bembarca(?:cao|coes)\b|\bnavios?\b/g],
  ["madeira", /\bmadeiras?\b/g],
  ["joias", /\bjoias?\b|\bsemijoias?\b/g],
];

const SINAIS_USO: readonly Regra[] = [
  ["concessão de uso", /\b(?:concessao|permissao|cessao)\s+(?:onerosa\s+|remunerada\s+|gratuita\s+)?(?:de\s+direito\s+real\s+)?de\s+uso\b/g],
  ["locação", /\blocacao\b|\barrendamento\b|\baluguel\b/g],
];

const VENDA = /\baliena(?:cao|coes|r)\b|\bvendas?\b|\bvender\b|\barremata/;

const MAX_SINAIS = 40;

function achar(texto: string, regras: readonly Regra[]): Sinal[] {
  const sinais: Sinal[] = [];
  for (const [rotulo, regex] of regras) {
    regex.lastIndex = 0;
    for (const achado of texto.matchAll(regex)) {
      sinais.push({ rotulo, inicio: achado.index, fim: achado.index + achado[0].length });
      if (sinais.length >= MAX_SINAIS) break;
    }
  }
  return sinais.sort((a, b) => a.inicio - b.inicio);
}

function rotulos(sinais: readonly Sinal[]): string {
  return [...new Set(sinais.map((s) => s.rotulo))].join(", ");
}

/** Analisa o texto (HTML aceito) e diz se é leilão de imóvel, com os sinais encontrados. */
export function analisarLeilaoImovel(entrada: string, opcoes: OpcoesFiltro = {}): AnaliseLeilaoImovel {
  const texto = semHtml(entrada);
  // Mesmo comprimento do original: as posições dos sinais valem no texto com acentos.
  const dobrado = dobrarCaixaEAcento(texto);
  const leilao = achar(dobrado, SINAIS_LEILAO);
  const imovelForte = achar(dobrado, SINAIS_IMOVEL_FORTE);
  const imovelFraco = achar(dobrado, SINAIS_IMOVEL_FRACO);
  const moveis = achar(dobrado, SINAIS_MOVEIS);
  const uso = achar(dobrado, SINAIS_USO);
  const usoSemVenda = uso.length > 0 && !VENDA.test(dobrado) ? uso : [];
  const base = { texto, leilao, imovelForte, imovelFraco, moveis, usoSemVenda };

  if (!opcoes.leilaoGarantido && leilao.length === 0) {
    return { ...base, aceito: false, motivo: "sem menção a leilão, praça ou hasta pública" };
  }
  if (usoSemVenda.length > 0) {
    return { ...base, aceito: false, motivo: `cessão de uso ou locação, não venda (${rotulos(usoSemVenda)})` };
  }
  if (imovelForte.length > 0) {
    const misto = moveis.length > 0 ? `; também cita bens móveis (${rotulos(moveis)})` : "";
    return { ...base, aceito: true, motivo: `leilão de imóvel (${rotulos(imovelForte)})${misto}` };
  }
  const fracos = new Set(imovelFraco.map((s) => s.rotulo));
  if (fracos.size >= 2 && moveis.length === 0) {
    return { ...base, aceito: true, motivo: `leilão com indícios de imóvel (${[...fracos].join(", ")})` };
  }
  if (moveis.length > 0) return { ...base, aceito: false, motivo: `leilão de bens móveis (${rotulos(moveis)})` };
  return { ...base, aceito: false, motivo: "leilão sem sinal claro de imóvel" };
}

/** Atalho: `true` se o texto é aviso de leilão de imóvel. */
export function ehLeilaoDeImovel(texto: string, opcoes: OpcoesFiltro = {}): boolean {
  return analisarLeilaoImovel(texto, opcoes).aceito;
}

const RESULTADO = /^\s*(?:aviso\s+de\s+|edital\s+de\s+)?(?:resultados?|homologa(?:cao|coes)|adjudica(?:cao|coes)|extratos?|ratifica(?:cao|coes)|revoga(?:cao|coes)|anula(?:cao|coes)|julgamentos?|retifica(?:cao|coes)|errata)\b/;
const LEILAO_ENCERRADO = /\bleil(?:ao|oes)\s+(?:deserto|fracassado|desertos|fracassados)\b/;

/**
 * Cabeçalho de aviso que não anuncia leilão futuro: resultado, homologação, extrato,
 * revogação, retificação, leilão deserto ou fracassado. O radar descarta esses avisos.
 */
export function ehAvisoSemLeilaoFuturo(titulo: string | null | undefined): boolean {
  if (!titulo) return false;
  const t = dobrarCaixaEAcento(semHtml(titulo));
  return RESULTADO.test(t) || LEILAO_ENCERRADO.test(t);
}

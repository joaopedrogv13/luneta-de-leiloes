/**
 * Busca do catálogo: filtros, ordem, página, facetas, histogramas e mapa. PURO (sem fs, sem rede):
 * recebe os imóveis e devolve o ResultadoBusca (sem `sobre`, que é do servidor).
 *
 * Desempenho: `criarIndice` prepara uma vez por conjunto (dicionários, tokens da busca por texto,
 * ordens) e `buscar` faz uma passada pelos imóveis calculando, para cada um, a máscara dos filtros que
 * ele NÃO passa (um bit por filtro). Com ela, as facetas "excluindo a própria faceta" saem na mesma
 * passada: máscara 0 = está no resultado (conta em tudo); máscara com um bit só = falha só naquele
 * filtro (conta só na faceta dele). Os histogramas varrem listas já ordenadas por valor.
 *
 * Regras (ver também src/lib/catalogo/tipos.ts):
 * - Listas: OU dentro do filtro, E entre filtros. Exceção: local (UF, cidade, bairro) funciona como um
 *   filtro só, em árvore: escolher cidades de uma UF restringe aquela UF a essas cidades, sem apagar as
 *   outras UFs escolhidas ("MG: Uberlândia; SP: todas"); o mesmo vale para bairros dentro da cidade.
 * - Faixas inclusivas; imóvel sem o dado (null) não passa numa faixa ativa.
 * - Plano Lente: tags, selo e nota de localização não saem (itens com `tags: []`, `selo: 0` e `notaLocal: null`),
 *   filtros comTags/semTags/selo/notaLocalMin e ordens "alertas"/"selo"/"localizacao" são ignorados (a ordem cai no
 *   padrão), facetas de tag e selo vazias.
 * - Selos desligados (prévia): filtro de selo ignorado, ordem "selo" cai no padrão, faceta de selo vazia.
 * - Faceta de tags (Luneta): toda tag que aparece nos resultados, confirmada ou em revisão. `total` =
 *   resultados com a tag CONFIRMADA (o que "exigir" daria; pode ser 0); `comRevisao` = com a tag
 *   confirmada ou em revisão (o que "esconder" tira). Tag já escondida: os dois contam quantos voltariam
 *   ao deixar de escondê-la. Ordem: grave, atenção, positivo, informativo.
 */
import { modoDoSlug, ROTULO_TAG_ESTACAO, temMetroPerto } from "./estacoes";
import { filtrosDoPlano, ordemDoPlano, paraPlano, pode } from "./planos";
import { MODALIDADE_ROTULO, OCUPACAO_ROTULO, PRACA_ROTULO, SELO_ROTULO, TIPO_ROTULO, UF_NOME } from "./rotulos";
import { interpretarBusca, palavras, type ClausulaBusca } from "./texto";
import {
  NAO_INFORMADO,
  ORDEM_PADRAO,
  type Busca,
  type Facetas,
  type Filtros,
  type Histograma,
  type ImovelResumo,
  type Modalidade,
  type OpcaoFaceta,
  type Ordem,
  type Plano,
  type PontoMapa,
  type ResultadoBusca,
  type Severidade,
  type TipoImovel,
} from "./tipos";

export const POR_PAGINA_PADRAO = 24;
export const POR_PAGINA_MAXIMO = 96;

const TIPOS: readonly TipoImovel[] = ["apartamento", "casa", "terreno", "comercial", "rural", "outro"];
const MODALIDADES: readonly Modalidade[] = ["leilao", "venda_direta", "venda_online", "licitacao_aberta", "outro"];
const PRACAS = ["1", "2", "unica", NAO_INFORMADO] as const;
const OCUPACOES = ["ocupado", "desocupado", NAO_INFORMADO] as const;
const NATUREZAS = ["judicial", "extrajudicial", NAO_INFORMADO] as const;
const SEVERIDADES: readonly Severidade[] = ["grave", "atencao", "positivo", "info"];
const ROTULO_ND = "Não informada";
const NATUREZA_ROTULO: Record<(typeof NATUREZAS)[number], string> = { judicial: "Judicial", extrajudicial: "Extrajudicial", nd: ROTULO_ND };

// Bits da máscara: o filtro que o imóvel NÃO passa.
const B_Q = 1 << 0;
const B_LOCAL = 1 << 1;
const B_TIPO = 1 << 2;
const B_LANCE = 1 << 3;
const B_AVALIACAO = 1 << 4;
const B_DESAGIO = 1 << 5;
const B_M2 = 1 << 6;
const B_AREA = 1 << 7;
const B_QUARTOS = 1 << 8;
const B_VAGAS = 1 << 9;
const B_MODALIDADE = 1 << 10;
const B_PRACA = 1 << 11;
const B_DATA = 1 << 12;
const B_FINANCIAMENTO = 1 << 13;
const B_FGTS = 1 << 14;
const B_PARCELAMENTO = 1 << 15;
const B_OCUPACAO = 1 << 16;
const B_NATUREZA = 1 << 17;
const B_FONTE = 1 << 18;
const B_FOTO = 1 << 19;
const B_COM_TAGS = 1 << 20;
const B_SEM_TAGS = 1 << 21;
const B_SELO = 1 << 22;
/** Praça vencida há mais de 1 dia: fica fora de tudo, como na exportação (não é faceta de ninguém). */
const B_VENCIDO = 1 << 23;
/** Luneta: nota de localização abaixo do mínimo (ou sem nota). */
const B_NOTA_LOCAL = 1 << 24;
/** Luneta (filtro avançado): sem estação de metrô a menos de 1 km (a tag "Metrô a X m"; estacoes.ts). */
const B_METRO = 1 << 25;
/**
 * Fora da área do mapa ("Buscar nesta área"). O bit mais alto que cabe no Int32 positivo, longe dos outros: um filtro
 * novo pode usar os de 26 a 29 sem colidir com este.
 */
const B_BBOX = 1 << 30;

const UM_DIA = 24 * 3600 * 1000;

/** Facetas vazias (pedido sem facetas). */
const FACETAS_VAZIAS: Facetas = {
  uf: [], cidade: [], bairro: [], tipo: [], modalidade: [], praca: [], ocupacao: [], natureza: [], fonte: [], tags: [], selo: [],
  lance: null, avaliacao: null, desagio: null, lanceM2: null, area: null, financiamento: 0, fgts: 0, parcelamento: 0, comFoto: 0,
};
/** As facetas dos filtros avançados (planos.ts › recursoDoFiltro), vazias para o plano que não os usa. */
const FACETAS_AVANCADAS_VAZIAS: Partial<Facetas> = {
  modalidade: [], praca: [], ocupacao: [], natureza: [], fonte: [], lanceM2: null, area: null, financiamento: 0, fgts: 0, parcelamento: 0, comFoto: 0,
  metroPerto: undefined,
};
const TRES_HORAS = 3 * 3600 * 1000;

/** Dia em Brasília (UTC−3, sem horário de verão) de uma data ISO ou "AAAA-MM-DD". */
export function diaBrasilia(iso: string | Date): string | null {
  if (typeof iso === "string" && /^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const t = typeof iso === "string" ? Date.parse(iso) : iso.getTime();
  return Number.isNaN(t) ? null : new Date(t - TRES_HORAS).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Índice
// ---------------------------------------------------------------------------

export interface OpcoesIndice {
  /** Texto a mais para a busca de cada imóvel (o servidor passa o endereço, que não está no resumo). */
  textoExtra?: (item: ImovelResumo, posicao: number) => string | null | undefined;
}

interface Cidade {
  chave: string;
  uf: number;
  nome: string;
  lat: number | null;
  lon: number | null;
}

interface Bairro {
  chave: string;
  cidade: number;
  nome: string;
}

type CampoHistograma = "lance" | "avaliacao" | "desagio" | "lanceM2" | "area";

/** Tudo o que a busca precisa, preparado uma vez por conjunto. Trate como opaco. */
export interface IndiceCatalogo {
  readonly itens: readonly ImovelResumo[];
  readonly n: number;
  readonly ufs: string[];
  readonly ufDe: Uint16Array;
  readonly cidades: Cidade[];
  readonly cidadeDe: Int32Array;
  readonly bairros: Bairro[];
  readonly bairroDe: Int32Array;
  readonly tipoDe: Uint8Array;
  readonly modalidadeDe: Uint8Array;
  readonly pracaDe: Uint8Array;
  readonly ocupacaoDe: Uint8Array;
  readonly naturezaDe: Uint8Array;
  readonly fontes: { id: string; nome: string }[];
  readonly fonteDe: Uint16Array;
  readonly dia: (string | null)[];
  readonly instante: Float64Array;
  readonly numeros: Record<CampoHistograma | "quartos" | "vagas" | "notaLocal", Float64Array>;
  readonly financiamento: Int8Array;
  readonly fgts: Int8Array;
  readonly parcelamento: Int8Array;
  readonly temFoto: Uint8Array;
  /** 1 = estação de metrô a menos de 1 km (a tag "metro-perto"; o filtro "Metrô a até 1 km") */
  readonly metroPerto: Uint8Array;
  readonly selo: Uint8Array;
  /** Ponto no mapa (graus; NaN sem ponto), para a área do mapa (Filtros.bbox). */
  readonly lat: Float64Array;
  readonly lon: Float64Array;
  /** Tags: dicionário de slugs e, por imóvel, bits das confirmadas e de todas (confirmadas + em revisão). */
  readonly slugs: { slug: string; rotulo: string; severidade: Severidade }[];
  readonly palavrasTag: number;
  readonly tagsConfirmadas: Uint32Array;
  readonly tagsTodas: Uint32Array;
  readonly alertas: Uint8Array;
  /**
   * Valor fora do padrão: lance acima de 5× a avaliação (erro de digitação da fonte, como um apartamento de
   * R$ 69,7 milhões avaliado em R$ 401 mil). Vai para o fim de todas as ordens e fica fora dos histogramas
   * de lance, deságio e R$/m² (senão abre "Maior lance" e estica a régua do filtro).
   */
  readonly suspeito: Uint8Array;
  /** Busca por texto: vocabulário ordenado e, por imóvel, os ids das palavras (CSR). */
  readonly vocabulario: string[];
  readonly tokInicio: Int32Array;
  readonly tokIds: Int32Array;
  /** Posição de cada imóvel na ordem dos ids (desempate). */
  readonly rankId: Int32Array;
  readonly ordens: Map<string, Int32Array>;
  readonly ordenadosPor: Map<CampoHistograma, Int32Array>;
}

const cache = new WeakMap<readonly ImovelResumo[], IndiceCatalogo>();

function dicionario<T>(lista: T[], mapa: Map<string, number>, chave: string, criar: () => T): number {
  let k = mapa.get(chave);
  if (k === undefined) {
    k = lista.length;
    lista.push(criar());
    mapa.set(chave, k);
  }
  return k;
}

const num = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? NaN : v);
const bool = (v: boolean | null | undefined) => (v === true ? 1 : v === false ? 0 : -1);

export function criarIndice(itens: readonly ImovelResumo[], opcoes: OpcoesIndice = {}): IndiceCatalogo {
  const n = itens.length;
  const ufs: string[] = [];
  const ufMapa = new Map<string, number>();
  const cidades: Cidade[] = [];
  const cidadeMapa = new Map<string, number>();
  const bairros: Bairro[] = [];
  const bairroMapa = new Map<string, number>();
  const fontes: { id: string; nome: string }[] = [];
  const fonteMapa = new Map<string, number>();
  const ufDe = new Uint16Array(n);
  const cidadeDe = new Int32Array(n);
  const bairroDe = new Int32Array(n);
  const tipoDe = new Uint8Array(n);
  const modalidadeDe = new Uint8Array(n);
  const pracaDe = new Uint8Array(n);
  const ocupacaoDe = new Uint8Array(n);
  const naturezaDe = new Uint8Array(n);
  const fonteDe = new Uint16Array(n);
  const dia: (string | null)[] = new Array(n);
  const instante = new Float64Array(n);
  const numeros = {
    lance: new Float64Array(n),
    avaliacao: new Float64Array(n),
    desagio: new Float64Array(n),
    lanceM2: new Float64Array(n),
    area: new Float64Array(n),
    quartos: new Float64Array(n),
    vagas: new Float64Array(n),
    notaLocal: new Float64Array(n),
  };
  const financiamento = new Int8Array(n);
  const fgts = new Int8Array(n);
  const parcelamento = new Int8Array(n);
  const temFoto = new Uint8Array(n);
  const metroPerto = new Uint8Array(n);
  const selo = new Uint8Array(n);
  const lat = new Float64Array(n);
  const lon = new Float64Array(n);

  // Tags: dicionário na ordem de gravidade, depois na ordem em que aparecem (a exportação já ordena pelo catálogo).
  const vistas = new Map<string, { slug: string; rotulo: string; severidade: Severidade; ordem: number }>();
  for (const i of itens) {
    for (const t of i.tags) {
      if (vistas.has(t.slug)) continue;
      // a tag de estação diz a distância ("Metrô a 450 m"): na faceta e nos filtros de tags vale o rótulo fixo
      const modo = modoDoSlug(t.slug);
      vistas.set(t.slug, { slug: t.slug, rotulo: modo ? ROTULO_TAG_ESTACAO[modo] : t.rotulo, severidade: t.severidade, ordem: vistas.size });
    }
  }
  const slugs = [...vistas.values()].sort((a, b) => SEVERIDADES.indexOf(a.severidade) - SEVERIDADES.indexOf(b.severidade) || a.ordem - b.ordem);
  const slugId = new Map(slugs.map((s, k) => [s.slug, k]));
  const palavrasTag = Math.max(1, Math.ceil(slugs.length / 32));
  const tagsConfirmadas = new Uint32Array(n * palavrasTag);
  const tagsTodas = new Uint32Array(n * palavrasTag);
  const alertas = new Uint8Array(n);
  const suspeito = new Uint8Array(n);

  // Cidades cuja posição já é a da sede do município (precisão "cidade").
  const cidadeNaSede = new Set<number>();
  // Busca por texto: tokens de cada imóvel.
  const tokensPorItem: string[][] = new Array(n);
  const vocab = new Set<string>();

  for (let k = 0; k < n; k++) {
    const i = itens[k]!;
    const u = dicionario(ufs, ufMapa, i.uf, () => i.uf);
    ufDe[k] = u;
    const chaveCidade = `${i.uf}|${i.cidade}`;
    const c = dicionario(cidades, cidadeMapa, chaveCidade, () => ({ chave: chaveCidade, uf: u, nome: i.cidade, lat: null, lon: null }));
    cidadeDe[k] = c;
    // Posição da cidade: a do primeiro imóvel com precisão "cidade" (sede do município); senão, a do primeiro com coordenada.
    const cid = cidades[c]!;
    if (i.lat !== null && i.lon !== null && (cid.lat === null || (i.precisaoGeo === "cidade" && !cidadeNaSede.has(c)))) {
      cid.lat = i.lat;
      cid.lon = i.lon;
      if (i.precisaoGeo === "cidade") cidadeNaSede.add(c);
    }
    if (i.bairro) {
      const chaveBairro = `${chaveCidade}|${i.bairro}`;
      bairroDe[k] = dicionario(bairros, bairroMapa, chaveBairro, () => ({ chave: chaveBairro, cidade: c, nome: i.bairro! }));
    } else bairroDe[k] = -1;
    tipoDe[k] = Math.max(0, TIPOS.indexOf(i.tipo));
    modalidadeDe[k] = Math.max(0, MODALIDADES.indexOf(i.modalidade));
    pracaDe[k] = i.praca === null ? 3 : Math.max(0, PRACAS.indexOf(i.praca));
    ocupacaoDe[k] = i.ocupacao === null ? 2 : Math.max(0, OCUPACOES.indexOf(i.ocupacao));
    naturezaDe[k] = i.judicial === true ? 0 : i.judicial === false ? 1 : 2;
    fonteDe[k] = dicionario(fontes, fonteMapa, i.fonte.id, () => ({ id: i.fonte.id, nome: i.fonte.nome }));
    dia[k] = i.dataPraca ? diaBrasilia(i.dataPraca) : null;
    instante[k] = i.dataPraca ? Date.parse(i.dataPraca) : NaN;
    numeros.lance[k] = num(i.lance);
    numeros.avaliacao[k] = num(i.avaliacao);
    numeros.desagio[k] = num(i.desagio);
    numeros.lanceM2[k] = num(i.lanceM2);
    numeros.area[k] = num(i.area);
    numeros.quartos[k] = num(i.quartos);
    numeros.vagas[k] = num(i.vagas);
    numeros.notaLocal[k] = num(i.notaLocal);
    financiamento[k] = bool(i.financiamento);
    fgts[k] = bool(i.fgts);
    parcelamento[k] = bool(i.parcelamento);
    temFoto[k] = i.foto ? 1 : 0;
    metroPerto[k] = temMetroPerto(i.tags) ? 1 : 0;
    selo[k] = i.selo;
    lat[k] = num(i.lat);
    lon[k] = num(i.lon);
    let nAlertas = 0;
    for (const t of i.tags) {
      const s = slugId.get(t.slug)!;
      const p = k * palavrasTag + (s >>> 5);
      tagsTodas[p]! |= 1 << (s & 31);
      if (!t.emRevisao) {
        tagsConfirmadas[p]! |= 1 << (s & 31);
        if (t.severidade === "grave" || t.severidade === "atencao") nAlertas++;
      }
    }
    alertas[k] = Math.min(255, nAlertas);
    suspeito[k] = i.avaliacao !== null && i.avaliacao > 0 && i.lance > 5 * i.avaliacao ? 1 : 0;
    const extra = opcoes.textoExtra?.(i, k) ?? "";
    const idSemZeros = i.id.replace(/^[a-z]+-0+/, "");
    const tokens = new Set(palavras(`${i.titulo} ${i.bairro ?? ""} ${i.cidade} ${extra} ${i.id} ${idSemZeros} ${TIPO_ROTULO[i.tipo] ?? ""} ${i.fonte.nome}`));
    tokensPorItem[k] = [...tokens];
    for (const t of tokens) vocab.add(t);
  }

  const vocabulario = [...vocab].sort();
  const vocabId = new Map(vocabulario.map((p, k) => [p, k]));
  const tokInicio = new Int32Array(n + 1);
  let totalTokens = 0;
  for (let k = 0; k < n; k++) {
    tokInicio[k] = totalTokens;
    totalTokens += tokensPorItem[k]!.length;
  }
  tokInicio[n] = totalTokens;
  const tokIds = new Int32Array(totalTokens);
  for (let k = 0, p = 0; k < n; k++) for (const t of tokensPorItem[k]!) tokIds[p++] = vocabId.get(t)!;

  const porId = Array.from({ length: n }, (_, k) => k).sort((a, b) => (itens[a]!.id < itens[b]!.id ? -1 : itens[a]!.id > itens[b]!.id ? 1 : 0));
  const rankId = new Int32Array(n);
  porId.forEach((k, r) => (rankId[k] = r));

  return {
    itens, n, ufs, ufDe, cidades, cidadeDe, bairros, bairroDe, tipoDe, modalidadeDe, pracaDe, ocupacaoDe, naturezaDe,
    fontes, fonteDe, dia, instante, numeros, financiamento, fgts, parcelamento, temFoto, metroPerto, selo, lat, lon, slugs, palavrasTag,
    tagsConfirmadas, tagsTodas, alertas, suspeito, vocabulario, tokInicio, tokIds, rankId, ordens: new Map(), ordenadosPor: new Map(),
  };
}

/** Índice de uma lista (guardado por lista: a mesma lista não é indexada duas vezes). */
export function indiceDe(itens: readonly ImovelResumo[], opcoes?: OpcoesIndice): IndiceCatalogo {
  let indice = cache.get(itens);
  if (!indice) {
    indice = criarIndice(itens, opcoes);
    cache.set(itens, indice);
  }
  return indice;
}

// ---------------------------------------------------------------------------
// Ordens
// ---------------------------------------------------------------------------

/** Compara números com NaN (sem dado) sempre por último. */
function cmpNum(a: number, b: number, desc: boolean): number {
  const na = Number.isNaN(a);
  const nb = Number.isNaN(b);
  if (na || nb) return na === nb ? 0 : na ? 1 : -1;
  return desc ? b - a : a - b;
}

function ordemDe(ix: IndiceCatalogo, ordem: Ordem, hoje: string): Int32Array {
  const chave = ordem === "data" ? `data:${hoje}` : ordem;
  const pronta = ix.ordens.get(chave);
  if (pronta) return pronta;
  const { numeros: v, rankId } = ix;
  const porDesagio = (a: number, b: number) => cmpNum(v.desagio[a]!, v.desagio[b]!, true);
  let cmp: (a: number, b: number) => number;
  switch (ordem) {
    case "lance-asc":
      cmp = (a, b) => cmpNum(v.lance[a]!, v.lance[b]!, false);
      break;
    case "lance-desc":
      cmp = (a, b) => cmpNum(v.lance[a]!, v.lance[b]!, true);
      break;
    case "m2-asc":
      cmp = (a, b) => cmpNum(v.lanceM2[a]!, v.lanceM2[b]!, false);
      break;
    case "area-desc":
      cmp = (a, b) => cmpNum(v.area[a]!, v.area[b]!, true);
      break;
    case "alertas":
      cmp = (a, b) => ix.alertas[a]! - ix.alertas[b]! || porDesagio(a, b);
      break;
    case "selo":
      cmp = (a, b) => ix.selo[b]! - ix.selo[a]! || porDesagio(a, b);
      break;
    case "localizacao":
      // maior nota primeiro; sem nota por último (cmpNum põe NaN no fim)
      cmp = (a, b) => cmpNum(v.notaLocal[a]!, v.notaLocal[b]!, true) || porDesagio(a, b);
      break;
    case "recentes": {
      const col = ix.itens.map((i) => i.coletadoEm);
      cmp = (a, b) => (col[a]! < col[b]! ? 1 : col[a]! > col[b]! ? -1 : 0) || porDesagio(a, b);
      break;
    }
    case "data": {
      // Praças de hoje em diante, da mais próxima; depois as que já passaram (a mais recente antes); sem data no fim.
      const grupo = (k: number) => (ix.dia[k] === null ? 2 : ix.dia[k]! >= hoje ? 0 : 1);
      cmp = (a, b) => {
        const ga = grupo(a);
        const gb = grupo(b);
        if (ga !== gb) return ga - gb;
        if (ga === 0) return cmpNum(ix.instante[a]!, ix.instante[b]!, false);
        if (ga === 1) return cmpNum(ix.instante[a]!, ix.instante[b]!, true);
        return porDesagio(a, b);
      };
      break;
    }
    default:
      cmp = porDesagio;
  }
  // valor fora do padrão (lance > 5× a avaliação) no fim de qualquer ordem
  const s = ix.suspeito;
  const lista = Array.from({ length: ix.n }, (_, k) => k).sort((a, b) => s[a]! - s[b]! || cmp(a, b) || rankId[a]! - rankId[b]!);
  const pronto = Int32Array.from(lista);
  if (ordem === "data") for (const k of [...ix.ordens.keys()]) if (k.startsWith("data:")) ix.ordens.delete(k);
  ix.ordens.set(chave, pronto);
  return pronto;
}

function ordenadosPor(ix: IndiceCatalogo, campo: CampoHistograma): Int32Array {
  const pronto = ix.ordenadosPor.get(campo);
  if (pronto) return pronto;
  const v = ix.numeros[campo];
  const lista: number[] = [];
  for (let k = 0; k < ix.n; k++) if (!Number.isNaN(v[k]!)) lista.push(k);
  lista.sort((a, b) => v[a]! - v[b]!);
  const r = Int32Array.from(lista);
  ix.ordenadosPor.set(campo, r);
  return r;
}

// ---------------------------------------------------------------------------
// Histogramas
// ---------------------------------------------------------------------------

/** Séries de números "redondos" por década (1-2-5, R5, R10, R20 arredondadas). */
const SERIES: readonly (readonly number[])[] = [
  [1, 2, 5],
  [1, 1.5, 2.5, 4, 6],
  [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8],
  [1, 1.1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.5, 2.8, 3.2, 3.5, 4, 4.5, 5, 5.6, 6.3, 7.1, 8, 9],
];
const BARRAS_ALVO = 24;

/** Limites em escala logarítmica com números redondos cobrindo [lo, hi], com cerca de 24 barras. */
export function limitesLog(lo: number, hi: number): number[] {
  const a = Math.max(lo, 1e-9);
  const b = Math.max(hi, a);
  let melhor: number[] = [];
  for (const serie of SERIES) {
    const valores: number[] = [];
    for (let e = Math.floor(Math.log10(a)) - 1; e <= Math.floor(Math.log10(b)) + 1; e++) {
      for (const s of serie) valores.push(Number.parseFloat((s * 10 ** e).toPrecision(6)));
    }
    let ini = 0;
    while (ini + 1 < valores.length && valores[ini + 1]! <= a) ini++;
    let fim = valores.length - 1;
    while (fim - 1 > ini && valores[fim - 1]! >= b) fim--;
    if (fim <= ini) fim = ini + 1;
    const limites = valores.slice(ini, fim + 1);
    if (!melhor.length || Math.abs(limites.length - 1 - BARRAS_ALVO) < Math.abs(melhor.length - 1 - BARRAS_ALVO)) melhor = limites;
  }
  return melhor;
}

/** Conta valores já ordenados em barras; abaixo do 1º limite vai na 1ª barra, acima do último na última. */
function contar(valores: Float64Array, m: number, limites: number[]): number[] {
  const totais = new Array<number>(limites.length - 1).fill(0);
  let j = 0;
  for (let k = 0; k < m; k++) {
    const x = valores[k]!;
    while (j < totais.length - 1 && x >= limites[j + 1]!) j++;
    totais[j]!++;
  }
  return totais;
}

function histogramaLog(valores: Float64Array, m: number): Histograma | null {
  if (m === 0) return null;
  const p1 = valores[Math.floor(0.01 * (m - 1))]!;
  const p99 = valores[Math.ceil(0.99 * (m - 1))]!;
  let lo = p1;
  if (lo <= 0) {
    // Valor zero (ex.: R$/m² arredondado de área enorme): a escala começa no menor positivo.
    let k = 0;
    while (k < m && valores[k]! <= 0) k++;
    lo = k < m ? valores[k]! : 1;
  }
  const limites = limitesLog(lo, Math.max(p99, lo));
  return { min: valores[0]!, max: valores[m - 1]!, limites, totais: contar(valores, m, limites) };
}

/**
 * Deságio: barras de 5 pontos, de max(−50, mínimo) até o maior deságio que existe (no máximo 100): uma régua
 * que termina em barras vazias ("95–100%: 0 imóveis") só ocupa espaço.
 */
function histogramaDesagio(valores: Float64Array, m: number): Histograma | null {
  if (m === 0) return null;
  const inicio = Math.min(95, Math.max(-50, Math.floor(valores[0]! / 5) * 5));
  const fim = Math.min(100, Math.max(inicio + 5, Math.ceil(valores[m - 1]! / 5) * 5));
  const limites: number[] = [];
  for (let x = inicio; x <= fim; x += 5) limites.push(x);
  return { min: valores[0]!, max: valores[m - 1]!, limites, totais: contar(valores, m, limites) };
}

// ---------------------------------------------------------------------------
// Busca
// ---------------------------------------------------------------------------

export interface OpcoesBusca {
  /** Selos desligados neste conjunto (prévia: critérios pendentes). */
  selosDesligados?: boolean;
  /**
   * "Agora" (padrão: o relógio): ordem por data da praça e corte dos vencidos. O instantâneo fica no ar
   * por dias; imóvel cuja praça passou há mais de 1 dia sai da busca, com a mesma regra da exportação.
   */
  agora?: Date;
  /** Para montar o índice quando `buscar` recebe a lista (o servidor passa o endereço). */
  indice?: OpcoesIndice;
  /** false = não agrega o mapa (`mapa: []`): o mapa do Brasil inteiro passa de 600 KB de JSON. Padrão true. */
  mapa?: boolean;
  /** false = facetas vazias (o pedido do mapa não as usa: ~80 KB a menos). Padrão true. */
  facetas?: boolean;
  /**
   * Recebe, logo depois da passada dos filtros, a máscara de cada imóvel (0 = está no resultado) e o plano já aplicado:
   * os pontos do mapa de verdade (src/lib/catalogo/pontos.ts) saem da mesma regra de filtros, sem repeti-la.
   */
  aoFiltrar?: (mascaras: Int32Array) => void;
}

/** Tira o que o plano não vê (planos.ts): no Lente, tags, selo e a nota de localização. */
export { paraPlano };

/**
 * Busca já validada: plano e conjunto aplicados aos filtros e à ordem (planos.ts). No Lente, os filtros avançados, os
 * de tags, selo e nota e as ordens da Luneta (alertas, selo, localização) são ignorados: um link da Luneta aberto no
 * Lente não filtra nada a mais (a tela avisa "este filtro é do plano Luneta").
 */
function efetivos(busca: Busca, selosDesligados: boolean): { f: Filtros; ordem: Ordem } {
  const f: Filtros = { ...filtrosDoPlano(busca.filtros, busca.plano) };
  let ordem = ordemDoPlano(busca.ordem, busca.plano);
  if (selosDesligados) {
    delete f.selo;
    if (ordem === "selo") ordem = ORDEM_PADRAO;
  }
  return { f, ordem };
}

const temLista = (l: readonly unknown[] | undefined): l is readonly unknown[] => Array.isArray(l) && l.length > 0;
const finito = (v: number | undefined): v is number => typeof v === "number" && Number.isFinite(v);

/** Marca, no vocabulário ordenado, as palavras que casam com o termo (início de palavra ou palavra exata). */
function marcarVocabulario(vocab: string[], termo: string, exato: boolean, marcas: Uint8Array) {
  let lo = 0;
  let hi = vocab.length;
  while (lo < hi) {
    const meio = (lo + hi) >>> 1;
    if (vocab[meio]! < termo) lo = meio + 1;
    else hi = meio;
  }
  for (let k = lo; k < vocab.length && vocab[k]!.startsWith(termo); k++) {
    if (!exato || vocab[k] === termo) marcas[k] = 1;
    if (exato) break;
  }
}

/** Apelidos de cidade que as pessoas digitam ("bh", "poa", "floripa"). */
const APELIDOS_CIDADE: Record<string, string> = {
  bh: "belo horizonte",
  poa: "porto alegre",
  bsb: "brasilia",
  floripa: "florianopolis",
  sampa: "sao paulo",
};

/** Nomes de cidades e bairros do índice (sem acento, minúsculas), para a busca que é só um nome de lugar. */
const lugaresPorNome = new WeakMap<IndiceCatalogo, { cidades: Map<string, number[]>; bairros: Map<string, number[]> }>();
function lugares(ix: IndiceCatalogo) {
  let l = lugaresPorNome.get(ix);
  if (!l) {
    const cidades = new Map<string, number[]>();
    const bairros = new Map<string, number[]>();
    const por = (m: Map<string, number[]>, nome: string, k: number) => {
      const chave = palavras(nome).join(" ");
      const lista = m.get(chave);
      if (lista) lista.push(k);
      else m.set(chave, [k]);
    };
    ix.cidades.forEach((c, k) => por(cidades, c.nome, k));
    ix.bairros.forEach((b, k) => por(bairros, b.nome, k));
    l = { cidades, bairros };
    lugaresPorNome.set(ix, l);
  }
  return l;
}

/**
 * Quais imóveis casam com o texto (null = sem filtro de texto).
 * - O texto inteiro é o nome de uma cidade ou de um bairro ("belo horizonte", "copacabana"): só os imóveis
 *   dessa cidade ou bairro, não os que têm o nome no endereço (a "Rua Belo Horizonte" em Belford Roxo).
 *   Nome de estado ("são paulo", "rio de janeiro") continua valendo o estado inteiro.
 * - Senão, todas as cláusulas precisam casar: estado/sigla pela UF, tipo e quartos pelos campos do imóvel,
 *   os termos pelas palavras do título, bairro, cidade, endereço e id. Sem `quartos` (o Lente: o filtro de quartos é
 *   da Luneta), "2 quartos" não filtra.
 */
function casarTexto(ix: IndiceCatalogo, q: string | undefined, quartos = true): Uint8Array | null {
  if (!q) return null;
  // cláusula repetida ("casa casa casa") não muda o resultado: conta uma vez só
  const vistas = new Set<string>();
  const clausulas: ClausulaBusca[] = interpretarBusca(q).filter((c) => {
    // "2 quartos" na busca é o filtro de quartos, da Luneta: o Lente não o usa (R4-VAZ-06)
    if (c.tipo === "quartos" && !quartos) return false;
    const k = JSON.stringify(c);
    if (vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });
  if (clausulas.length === 0) return null;

  const bruta = palavras(q).join(" ");
  const frase = APELIDOS_CIDADE[bruta] ?? bruta;
  const ehEstado =clausulas.length === 1 && (clausulas[0]!.tipo === "estado" || clausulas[0]!.tipo === "uf");
  if (!ehEstado && frase.length >= 3) {
    const { cidades, bairros } = lugares(ix);
    const nasCidades = cidades.get(frase);
    const nosBairros = bairros.get(frase);
    if (nasCidades || nosBairros) {
      const cidadeOk = new Uint8Array(ix.cidades.length);
      for (const c of nasCidades ?? []) cidadeOk[c] = 1;
      const bairroOk = new Uint8Array(ix.bairros.length);
      for (const b of nosBairros ?? []) bairroOk[b] = 1;
      const ok = new Uint8Array(ix.n);
      for (let k = 0; k < ix.n; k++) {
        const b = ix.bairroDe[k]!;
        ok[k] = cidadeOk[ix.cidadeDe[k]!] || (b >= 0 && bairroOk[b]) ? 1 : 0;
      }
      return ok;
    }
  }

  type Teste = { uf: number; grupos: Uint8Array[]; campo?: (k: number) => boolean };
  const ufIndice = (uf: string) => ix.ufs.indexOf(uf);
  const testes: Teste[] = clausulas.map((c) => {
    if (c.tipo === "uf") return { uf: ufIndice(c.uf), grupos: [] };
    if (c.tipo === "imovel") {
      const t = TIPOS.indexOf(c.imovel);
      return { uf: -2, grupos: [], campo: (k) => ix.tipoDe[k] === t };
    }
    if (c.tipo === "quartos") {
      const v = ix.numeros.quartos;
      return { uf: -2, grupos: [], campo: c.minimo ? (k) => v[k]! >= c.n : (k) => v[k] === c.n };
    }
    const termos = c.tipo === "termo" ? [c.termo] : c.palavras;
    const exato = c.tipo === "termo" ? !!c.exato : !c.parcial;
    const grupos = termos.map((t) => {
      const marcas = new Uint8Array(ix.vocabulario.length);
      marcarVocabulario(ix.vocabulario, t, exato, marcas);
      return marcas;
    });
    return { uf: c.tipo === "estado" ? ufIndice(c.uf) : -2, grupos };
  });
  const ok = new Uint8Array(ix.n);
  const { tokInicio, tokIds, ufDe } = ix;
  for (let k = 0; k < ix.n; k++) {
    let passa = true;
    for (const t of testes) {
      if (t.campo) {
        if (!t.campo(k)) {
          passa = false;
          break;
        }
        continue;
      }
      if (t.uf >= 0 && ufDe[k] === t.uf) continue; // estado ou sigla: a UF do imóvel basta
      if (t.grupos.length === 0) {
        passa = false; // sigla de UF de outro estado
        break;
      }
      // todas as palavras do grupo precisam aparecer no imóvel
      for (const marcas of t.grupos) {
        let achou = false;
        for (let p = tokInicio[k]!; p < tokInicio[k + 1]!; p++) {
          if (marcas[tokIds[p]!]) {
            achou = true;
            break;
          }
        }
        if (!achou) {
          passa = false;
          break;
        }
      }
      if (!passa) break;
    }
    ok[k] = passa ? 1 : 0;
  }
  return ok;
}

function bitsDeTags(ix: IndiceCatalogo, slugs: readonly string[] | undefined): { bits: Uint32Array; desconhecida: boolean } | null {
  if (!temLista(slugs)) return null;
  const bits = new Uint32Array(ix.palavrasTag);
  let desconhecida = false;
  for (const slug of slugs) {
    const s = ix.slugs.findIndex((x) => x.slug === slug);
    if (s < 0) desconhecida = true;
    else bits[s >>> 5]! |= 1 << (s & 31);
  }
  return { bits, desconhecida };
}

function popcount(x: number): number {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

function opcoes<T extends string>(valores: readonly T[], totais: Int32Array, rotulo: (v: T) => string, selecionados: readonly string[] | undefined): OpcaoFaceta[] {
  const sel = new Set(selecionados ?? []);
  return valores.flatMap((v, k) => (totais[k]! > 0 || sel.has(v) ? [{ valor: v, rotulo: rotulo(v), total: totais[k]! }] : []));
}

const porTotal = (a: OpcaoFaceta, b: OpcaoFaceta) => b.total - a.total || a.rotulo.localeCompare(b.rotulo, "pt-BR");

/**
 * Busca no conjunto: filtra, ordena, pagina e agrega (facetas, histogramas e mapa). Aceita a lista
 * (indexada na primeira vez e guardada) ou um índice pronto.
 */
export function buscar(fonte: IndiceCatalogo | readonly ImovelResumo[], busca: Busca, opcoesBusca: OpcoesBusca = {}): Omit<ResultadoBusca, "sobre"> {
  const ix = Array.isArray(fonte) ? indiceDe(fonte as readonly ImovelResumo[], opcoesBusca.indice) : (fonte as IndiceCatalogo);
  const selosDesligados = opcoesBusca.selosDesligados ?? false;
  // o que o plano vê nas facetas (no Lente, nem a contagem das tags, do selo, da nota e dos filtros avançados sai)
  const veTags = pode(busca.plano, "tags");
  const veSelo = pode(busca.plano, "selos");
  const veNota = pode(busca.plano, "localizacao");
  const veAvancados = pode(busca.plano, "filtrosAvancados");
  const { f, ordem } = efetivos(busca, selosDesligados);
  const agora = opcoesBusca.agora ?? new Date();
  const hoje = diaBrasilia(agora)!;
  const vencidoAntesDe = agora.getTime() - UM_DIA;
  const n = ix.n;
  const v = ix.numeros;

  // ---- preparação dos filtros
  const texto = casarTexto(ix, f.q, veAvancados);

  const selUf = new Set(f.uf ?? []);
  const selCidade = new Set(f.cidade ?? []);
  const selBairro = new Set(f.bairro ?? []);
  const temLocal = selUf.size + selCidade.size + selBairro.size > 0;
  const ufRefinada = new Set<string>();
  const cidadeRefinada = new Set<string>();
  for (const c of selCidade) ufRefinada.add(c.split("|")[0]!);
  for (const b of selBairro) {
    const [uf, cidade] = b.split("|");
    ufRefinada.add(uf!);
    cidadeRefinada.add(`${uf}|${cidade}`);
  }
  const ufAtiva = new Uint8Array(ix.ufs.length);
  const ufRef = new Uint8Array(ix.ufs.length);
  ix.ufs.forEach((u, k) => {
    ufRef[k] = ufRefinada.has(u) ? 1 : 0;
    ufAtiva[k] = selUf.has(u) || ufRef[k] ? 1 : 0;
  });
  const cidadeAtiva = new Uint8Array(ix.cidades.length);
  const cidadeRef = new Uint8Array(ix.cidades.length);
  ix.cidades.forEach((c, k) => {
    cidadeRef[k] = cidadeRefinada.has(c.chave) ? 1 : 0;
    cidadeAtiva[k] = selCidade.has(c.chave) || cidadeRef[k] ? 1 : 0;
  });
  const bairroSel = new Uint8Array(ix.bairros.length);
  ix.bairros.forEach((b, k) => (bairroSel[k] = selBairro.has(b.chave) ? 1 : 0));
  /** Local considerando a UF do imóvel como escolhida (faceta de UF). */
  const localDentroDaUf = (k: number): boolean => {
    if (!ufRef[ix.ufDe[k]!]) return true;
    const c = ix.cidadeDe[k]!;
    if (!cidadeAtiva[c]) return false;
    if (!cidadeRef[c]) return true;
    const b = ix.bairroDe[k]!;
    return b >= 0 && bairroSel[b] === 1;
  };
  /** Local dentro da cidade (faceta de cidade): só o recorte de bairros, se houver. */
  const localDentroDaCidade = (k: number): boolean => {
    const c = ix.cidadeDe[k]!;
    if (!cidadeRef[c]) return true;
    const b = ix.bairroDe[k]!;
    return b >= 0 && bairroSel[b] === 1;
  };

  const lista = <T extends string>(valores: readonly T[], sel: readonly string[] | undefined): Uint8Array | null => {
    if (!temLista(sel)) return null;
    const s = new Set(sel);
    return Uint8Array.from(valores, (x) => (s.has(x) ? 1 : 0));
  };
  const okTipo = lista(TIPOS, f.tipo);
  const okModalidade = lista(MODALIDADES, f.modalidade);
  const okPraca = lista(PRACAS, f.praca);
  const okOcupacao = lista(OCUPACOES, f.ocupacao);
  const okNatureza = lista(NATUREZAS, f.natureza);
  const okFonte = temLista(f.fonte) ? Uint8Array.from(ix.fontes, (x) => (f.fonte!.includes(x.id) ? 1 : 0)) : null;
  // Faixa com as pontas trocadas (mínimo acima do máximo, digitado ao contrário) vale como a faixa certa.
  const faixa = (min: number | undefined, max: number | undefined) => {
    if (!finito(min) && !finito(max)) return null;
    const lo = finito(min) ? min : -Infinity;
    const hi = finito(max) ? max : Infinity;
    return lo <= hi ? { min: lo, max: hi } : { min: hi, max: lo };
  };
  const fLance = faixa(f.lanceMin, f.lanceMax);
  const fAvaliacao = faixa(f.avaliacaoMin, f.avaliacaoMax);
  const fDesagio = faixa(f.desagioMin, f.desagioMax);
  const fM2 = faixa(f.lanceM2Min, f.lanceM2Max);
  const fArea = faixa(f.areaMin, f.areaMax);
  // "pelo menos 0" não filtra (senão esconderia quem não informa quartos ou vagas)
  const quartosMin = finito(f.quartosMin) && f.quartosMin > 0 ? f.quartosMin : null;
  const vagasMin = finito(f.vagasMin) && f.vagasMin > 0 ? f.vagasMin : null;
  // nota mínima 0 não filtra (senão esconderia quem não tem nota)
  const notaLocalMin = finito(f.notaLocalMin) && f.notaLocalMin > 0 ? Math.min(100, f.notaLocalMin) : null;
  // dia que não existe ("2026-99-99") não filtra
  const diaValido = (d: string | undefined) => (d && !Number.isNaN(Date.parse(`${d}T12:00:00Z`)) ? d : null);
  const dataDe = diaValido(f.dataDe);
  const dataAte = diaValido(f.dataAte);
  const simNao = (b: boolean | undefined) => (b === true ? 1 : b === false ? 0 : null);
  const fFin = simNao(f.financiamento);
  const fFgts = simNao(f.fgts);
  const fParc = simNao(f.parcelamento);
  const fFoto = simNao(f.comFoto);
  // "Metrô a até 1 km": só o sim filtra (não há "sem metrô")
  const fMetro = f.metroPerto === true;
  const com = bitsDeTags(ix, f.comTags);
  const sem = bitsDeTags(ix, f.semTags);
  const okSelo = temLista(f.selo) ? Uint8Array.from([0, 1, 2, 3], (s) => (f.selo!.includes(s as 1 | 2 | 3) ? 1 : 0)) : null;
  const bbox = caixaValida(f.bbox);
  const W = ix.palavrasTag;

  // ---- contadores
  const cUf = new Int32Array(ix.ufs.length);
  const cCidade = new Int32Array(ix.cidades.length);
  const cBairro = new Int32Array(ix.bairros.length);
  const cTipo = new Int32Array(TIPOS.length);
  const cModalidade = new Int32Array(MODALIDADES.length);
  const cPraca = new Int32Array(PRACAS.length);
  const cOcupacao = new Int32Array(OCUPACOES.length);
  const cNatureza = new Int32Array(NATUREZAS.length);
  const cFonte = new Int32Array(ix.fontes.length);
  const cTag = new Int32Array(ix.slugs.length);
  /** Com a tag confirmada OU em revisão (o que "esconder" tira). */
  const cTagRevisao = new Int32Array(ix.slugs.length);
  const cSelo = new Int32Array(4);
  let cFin = 0;
  let cFgts = 0;
  let cParc = 0;
  let cFoto = 0;
  /** com estação de metrô a menos de 1 km, com os outros filtros (o filtro "Metrô a até 1 km") */
  let cMetro = 0;
  /** imóveis com cada nota de localização (0 a 100), com os outros filtros (só na Luneta) */
  const cNota = new Int32Array(101);
  /** com data da praça; todos coletados no mesmo dia? (as ordens "Praça mais próxima" e "Mais recentes" avisam quando não ajudam) */
  let cData = 0;
  let primeiraColeta: string | null = null;
  let variasColetas = false;
  let total = 0;
  let vencidos = 0;

  const mascaras = new Int32Array(n);
  for (let k = 0; k < n; k++) {
    if (ix.instante[k]! < vencidoAntesDe) {
      mascaras[k] = B_VENCIDO;
      vencidos++;
      continue;
    }
    let m = 0;
    if (texto && !texto[k]) m |= B_Q;
    if (temLocal) {
      const u = ix.ufDe[k]!;
      if (!ufAtiva[u] || !localDentroDaUf(k)) m |= B_LOCAL;
    }
    if (okTipo && !okTipo[ix.tipoDe[k]!]) m |= B_TIPO;
    if (fLance) {
      const x = v.lance[k]!;
      if (!(x >= fLance.min && x <= fLance.max)) m |= B_LANCE;
    }
    if (fAvaliacao) {
      const x = v.avaliacao[k]!;
      if (!(x >= fAvaliacao.min && x <= fAvaliacao.max)) m |= B_AVALIACAO;
    }
    if (fDesagio) {
      const x = v.desagio[k]!;
      if (!(x >= fDesagio.min && x <= fDesagio.max)) m |= B_DESAGIO;
    }
    if (fM2) {
      const x = v.lanceM2[k]!;
      if (!(x >= fM2.min && x <= fM2.max)) m |= B_M2;
    }
    if (fArea) {
      const x = v.area[k]!;
      if (!(x >= fArea.min && x <= fArea.max)) m |= B_AREA;
    }
    if (quartosMin !== null && !(v.quartos[k]! >= quartosMin)) m |= B_QUARTOS;
    if (vagasMin !== null && !(v.vagas[k]! >= vagasMin)) m |= B_VAGAS;
    if (notaLocalMin !== null && !(v.notaLocal[k]! >= notaLocalMin)) m |= B_NOTA_LOCAL;
    if (okModalidade && !okModalidade[ix.modalidadeDe[k]!]) m |= B_MODALIDADE;
    if (okPraca && !okPraca[ix.pracaDe[k]!]) m |= B_PRACA;
    if (dataDe !== null || dataAte !== null) {
      const d = ix.dia[k];
      if (d === null || (dataDe !== null && d < dataDe) || (dataAte !== null && d > dataAte)) m |= B_DATA;
    }
    if (fFin !== null && ix.financiamento[k] !== fFin) m |= B_FINANCIAMENTO;
    if (fFgts !== null && ix.fgts[k] !== fFgts) m |= B_FGTS;
    if (fParc !== null && ix.parcelamento[k] !== fParc) m |= B_PARCELAMENTO;
    if (okOcupacao && !okOcupacao[ix.ocupacaoDe[k]!]) m |= B_OCUPACAO;
    if (okNatureza && !okNatureza[ix.naturezaDe[k]!]) m |= B_NATUREZA;
    if (okFonte && !okFonte[ix.fonteDe[k]!]) m |= B_FONTE;
    if (fFoto !== null && ix.temFoto[k] !== fFoto) m |= B_FOTO;
    if (fMetro && !ix.metroPerto[k]) m |= B_METRO;
    if (com) {
      let passa = !com.desconhecida;
      for (let w = 0; passa && w < W; w++) passa = (ix.tagsConfirmadas[k * W + w]! & com.bits[w]!) === com.bits[w];
      if (!passa) m |= B_COM_TAGS;
    }
    let semAcertos = 0;
    let semUltima = -1;
    if (sem) {
      for (let w = 0; w < W; w++) {
        const x = ix.tagsTodas[k * W + w]! & sem.bits[w]!;
        if (x) {
          semAcertos += popcount(x);
          semUltima = w * 32 + (31 - Math.clz32(x));
        }
      }
      if (semAcertos > 0) m |= B_SEM_TAGS;
    }
    if (okSelo && !okSelo[ix.selo[k]!]) m |= B_SELO;
    if (bbox) {
      // NaN (sem ponto) falha nas duas comparações
      const la = ix.lat[k]!;
      const lo = ix.lon[k]!;
      if (!(la >= bbox[1] && la <= bbox[3] && lo >= bbox[0] && lo <= bbox[2])) m |= B_BBOX;
    }
    mascaras[k] = m;
    // contagem da nota (o filtro da nota mínima mostra quantos daria cada valor): passa nos outros filtros
    if (veNota && (m === 0 || m === B_NOTA_LOCAL)) {
      const nota = v.notaLocal[k]!;
      if (nota === nota) cNota[Math.min(100, Math.max(0, Math.round(nota)))]!++;
    }

    // ---- facetas
    if (m === 0) {
      total++;
      cUf[ix.ufDe[k]!]!++;
      cCidade[ix.cidadeDe[k]!]!++;
      if (ix.bairroDe[k]! >= 0) cBairro[ix.bairroDe[k]!]!++;
      cTipo[ix.tipoDe[k]!]!++;
      cModalidade[ix.modalidadeDe[k]!]!++;
      cPraca[ix.pracaDe[k]!]!++;
      cOcupacao[ix.ocupacaoDe[k]!]!++;
      cNatureza[ix.naturezaDe[k]!]!++;
      cFonte[ix.fonteDe[k]!]!++;
      if (ix.financiamento[k] === 1) cFin++;
      if (ix.fgts[k] === 1) cFgts++;
      if (ix.parcelamento[k] === 1) cParc++;
      if (ix.temFoto[k]) cFoto++;
      // com o filtro ligado, os resultados são exatamente os com metrô; desligado, quantos o filtro deixaria
      if (ix.metroPerto[k]) cMetro++;
      if (ix.dia[k] !== null) cData++;
      const coleta = ix.itens[k]!.coletadoEm;
      if (primeiraColeta === null) primeiraColeta = coleta;
      else if (coleta !== primeiraColeta) variasColetas = true;
      cSelo[ix.selo[k]!]!++;
      if (veTags) {
        for (let w = 0; w < W; w++) {
          let x = ix.tagsConfirmadas[k * W + w]!;
          while (x) {
            const bit = 31 - Math.clz32(x);
            cTag[w * 32 + bit]!++;
            x &= ~(1 << bit);
          }
          let y = ix.tagsTodas[k * W + w]!;
          while (y) {
            const bit = 31 - Math.clz32(y);
            cTagRevisao[w * 32 + bit]!++;
            y &= ~(1 << bit);
          }
        }
      }
      continue;
    }
    if ((m & (m - 1)) !== 0) continue; // falha em dois ou mais filtros: não conta em faceta nenhuma
    switch (m) {
      case B_LOCAL:
        // UF: como se a UF do imóvel estivesse escolhida; cidade: só o recorte de bairros; bairro: tudo.
        if (localDentroDaUf(k)) cUf[ix.ufDe[k]!]!++;
        if (localDentroDaCidade(k)) cCidade[ix.cidadeDe[k]!]!++;
        if (ix.bairroDe[k]! >= 0) cBairro[ix.bairroDe[k]!]!++;
        break;
      case B_TIPO:
        cTipo[ix.tipoDe[k]!]!++;
        break;
      case B_MODALIDADE:
        cModalidade[ix.modalidadeDe[k]!]!++;
        break;
      case B_PRACA:
        cPraca[ix.pracaDe[k]!]!++;
        break;
      case B_OCUPACAO:
        cOcupacao[ix.ocupacaoDe[k]!]!++;
        break;
      case B_NATUREZA:
        cNatureza[ix.naturezaDe[k]!]!++;
        break;
      case B_FONTE:
        cFonte[ix.fonteDe[k]!]!++;
        break;
      case B_FINANCIAMENTO:
        if (ix.financiamento[k] === 1) cFin++;
        break;
      case B_FGTS:
        if (ix.fgts[k] === 1) cFgts++;
        break;
      case B_PARCELAMENTO:
        if (ix.parcelamento[k] === 1) cParc++;
        break;
      case B_FOTO:
        if (ix.temFoto[k]) cFoto++;
        break;
      case B_SELO:
        cSelo[ix.selo[k]!]!++;
        break;
      case B_SEM_TAGS:
        // escondido por uma tag só: conta nela ("quantos voltam se deixar de esconder")
        if (semAcertos === 1 && veTags) {
          cTag[semUltima]!++;
          cTagRevisao[semUltima]!++;
        }
        break;
    }
  }

  opcoesBusca.aoFiltrar?.(mascaras);

  // ---- histogramas (itens que passam nos OUTROS filtros)
  const buffer = new Float64Array(n);
  const semFacetas = opcoesBusca.facetas === false;
  const coletar = (campo: CampoHistograma, bit: number): number => {
    if (semFacetas) return 0;
    const ordem = ordenadosPor(ix, campo);
    const valores = v[campo];
    // valor fora do padrão não estica a régua de lance, deságio e R$/m²
    const tirarSuspeitos = campo !== "avaliacao" && campo !== "area";
    let m = 0;
    for (let p = 0; p < ordem.length; p++) {
      const k = ordem[p]!;
      const mk = mascaras[k]!;
      if ((mk === 0 || mk === bit) && !(tirarSuspeitos && ix.suspeito[k])) buffer[m++] = valores[k]!;
    }
    return m;
  };
  const hLance = histogramaLog(buffer, coletar("lance", B_LANCE));
  const hAvaliacao = histogramaLog(buffer, coletar("avaliacao", B_AVALIACAO));
  const hDesagio = histogramaDesagio(buffer, coletar("desagio", B_DESAGIO));
  const hM2 = histogramaLog(buffer, coletar("lanceM2", B_M2));
  const hArea = histogramaLog(buffer, coletar("area", B_AREA));

  // ---- facetas de local
  const facetaUf = ix.ufs
    .flatMap((u, k) => (cUf[k]! > 0 || selUf.has(u) ? [{ valor: u, rotulo: UF_NOME[u] ?? u, total: cUf[k]! }] : []))
    .sort(porTotal);
  // Cidades das UFs ESCOLHIDAS no filtro de UF (ou de todas): quem escolheu só uma cidade continua vendo
  // as cidades das outras UFs para acrescentar ("Uberlândia/MG" e depois "Campinas/SP").
  const facetaCidade = ix.cidades
    .flatMap((c, k) => {
      const naUf = selUf.size === 0 || selUf.has(ix.ufs[c.uf]!);
      if (!selCidade.has(c.chave) && !(naUf && cCidade[k]! > 0)) return [];
      return [{ valor: c.chave, rotulo: `${c.nome}/${ix.ufs[c.uf]}`, total: cCidade[k]! }];
    })
    .sort(porTotal);
  const cidadesAtivas = ix.cidades.filter((_, k) => cidadeAtiva[k]);
  const facetaBairro =
    cidadesAtivas.length === 0
      ? ix.bairros.flatMap((b, k) => (selBairro.has(b.chave) ? [{ valor: b.chave, rotulo: b.nome, total: cBairro[k]! }] : []))
      : ix.bairros
          .flatMap((b, k) => {
            if (!selBairro.has(b.chave) && !(cidadeAtiva[b.cidade] && cBairro[k]! > 0)) return [];
            const rotulo = cidadesAtivas.length > 1 ? `${b.nome} · ${ix.cidades[b.cidade]!.nome}` : b.nome;
            return [{ valor: b.chave, rotulo, total: cBairro[k]! }];
          })
          .sort(porTotal);

  // ---- mapa (resultados agregados por cidade)
  const porCidade = new Map<number, PontoMapa & { destaquesK: number[] }>();
  const melhorDestaque = (a: number, b: number) =>
    cmpNum(v.desagio[a]!, v.desagio[b]!, true) || ix.temFoto[b]! - ix.temFoto[a]! || ix.rankId[a]! - ix.rankId[b]!;
  for (let k = 0; k < n && opcoesBusca.mapa !== false; k++) {
    if (mascaras[k] !== 0) continue;
    const c = ix.cidadeDe[k]!;
    const cidade = ix.cidades[c]!;
    if (cidade.lat === null || cidade.lon === null) continue;
    let p = porCidade.get(c);
    if (!p) {
      p = {
        chave: cidade.chave, cidade: cidade.nome, uf: ix.ufs[cidade.uf]!, lat: cidade.lat, lon: cidade.lon,
        total: 0, lanceMin: Infinity, desagioMax: null, destaques: [], destaquesK: [],
      };
      porCidade.set(c, p);
    }
    p.total++;
    if (v.lance[k]! < p.lanceMin) p.lanceMin = v.lance[k]!;
    const d = v.desagio[k]!;
    if (!Number.isNaN(d) && (p.desagioMax === null || d > p.desagioMax)) p.desagioMax = d;
    const dk = p.destaquesK;
    if (dk.length < 3 || melhorDestaque(k, dk[dk.length - 1]!) < 0) {
      dk.push(k);
      dk.sort(melhorDestaque);
      if (dk.length > 3) dk.pop();
    }
  }
  const mapa: PontoMapa[] = [...porCidade.values()]
    .map(({ destaquesK, ...p }) => ({
      ...p,
      destaques: destaquesK.map((k) => {
        const i = ix.itens[k]!;
        // foto ilustrativa (exemplo fictício) não vai para a miniatura do mapa, onde não caberia o rótulo
        return { id: i.id, titulo: i.titulo, tipo: i.tipo, foto: i.fotoIlustrativa ? null : i.foto, lance: i.lance, desagio: i.desagio, bairro: i.bairro };
      }),
    }))
    .sort((a, b) => b.total - a.total || (a.chave < b.chave ? -1 : 1));

  // ---- página
  const porPagina = Math.min(POR_PAGINA_MAXIMO, Math.max(1, Math.floor(finito(busca.porPagina) ? busca.porPagina : POR_PAGINA_PADRAO)));
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const pagina = Math.min(totalPaginas, Math.max(1, Math.floor(finito(busca.pagina) ? busca.pagina : 1)));
  const inicio = (pagina - 1) * porPagina;
  const itens: ImovelResumo[] = [];
  if (total > 0) {
    const ordenados = ordemDe(ix, ordem, hoje);
    let visto = 0;
    for (let p = 0; p < ordenados.length && itens.length < porPagina; p++) {
      const k = ordenados[p]!;
      if (mascaras[k] !== 0) continue;
      if (visto++ >= inicio) itens.push(paraPlano(ix.itens[k]!, busca.plano));
    }
  }

  const tagsSel = new Set([...(f.comTags ?? []), ...(f.semTags ?? [])]);
  const facetas: Facetas = {
    uf: facetaUf,
    cidade: facetaCidade,
    bairro: facetaBairro,
    tipo: opcoes(TIPOS, cTipo, (t) => TIPO_ROTULO[t], f.tipo),
    modalidade: opcoes(MODALIDADES, cModalidade, (m) => MODALIDADE_ROTULO[m], f.modalidade),
    praca: opcoes(PRACAS, cPraca, (p) => (p === NAO_INFORMADO ? ROTULO_ND : PRACA_ROTULO[p]), f.praca),
    ocupacao: opcoes(OCUPACOES, cOcupacao, (o) => (o === NAO_INFORMADO ? ROTULO_ND : OCUPACAO_ROTULO[o]), f.ocupacao),
    natureza: opcoes(NATUREZAS, cNatureza, (x) => NATUREZA_ROTULO[x], f.natureza),
    fonte: ix.fontes
      .flatMap((x, k) => (cFonte[k]! > 0 || f.fonte?.includes(x.id) ? [{ valor: x.id, rotulo: x.nome, total: cFonte[k]! }] : []))
      .sort(porTotal),
    tags: !veTags
      ? []
      : ix.slugs.flatMap((s, k) =>
          cTagRevisao[k]! > 0 || tagsSel.has(s.slug)
            ? [{ valor: s.slug, rotulo: s.rotulo, total: cTag[k]!, comRevisao: cTagRevisao[k]!, severidade: s.severidade }]
            : [],
        ),
    selo:
      !veSelo || selosDesligados
        ? []
        : ([3, 2, 1] as const).flatMap((s) => (cSelo[s]! > 0 || f.selo?.includes(s) ? [{ valor: String(s), rotulo: SELO_ROTULO[s], total: cSelo[s]! }] : [])),
    lance: hLance,
    avaliacao: hAvaliacao,
    desagio: hDesagio,
    lanceM2: hM2,
    area: hArea,
    financiamento: cFin,
    fgts: cFgts,
    parcelamento: cParc,
    comFoto: cFoto,
    comData: cData,
    coletaUnica: total > 0 && !variasColetas,
    notaLocal: veNota ? acumuladoDeCima(cNota) : [],
    metroPerto: cMetro,
  };
  // filtros avançados (Luneta): no Lente as contagens e histogramas deles não saem (os controles aparecem travados)
  if (!veAvancados) Object.assign(facetas, FACETAS_AVANCADAS_VAZIAS);

  // sem facetas (o pedido do mapa): ~80 KB a menos na resposta
  return { total, pagina, porPagina, totalPaginas, itens, facetas: semFacetas ? FACETAS_VAZIAS : facetas, mapa, totalConjunto: n - vencidos, selosDesligados };
}

/** A área do mapa, se for um retângulo de verdade (números finitos, oeste < leste, sul < norte); senão não filtra. */
function caixaValida(c: Filtros["bbox"]): readonly [number, number, number, number] | null {
  if (!Array.isArray(c) || c.length !== 4 || !c.every((x) => typeof x === "number" && Number.isFinite(x))) return null;
  const [o, s, l, n] = c;
  return o < l && s < n ? [o, s, l, n] : null;
}

/** Soma de cima para baixo: saida[t] = quantos com valor ≥ t. */
function acumuladoDeCima(c: Int32Array): number[] {
  const saida = new Array<number>(c.length);
  let soma = 0;
  for (let t = c.length - 1; t >= 0; t--) saida[t] = soma += c[t]!;
  return saida;
}

/** Atalho para a primeira página com a ordem padrão (testes e páginas simples). */
export function buscaPadrao(conjunto: Busca["conjunto"], plano: Plano = "luneta", filtros: Filtros = {}): Busca {
  return { conjunto, plano, filtros, ordem: ORDEM_PADRAO, pagina: 1 };
}

/** Quantos dias faltam para uma data (para rótulos "faltam 3 dias"); null sem data. */
export function diasAte(iso: string | null, agora: Date = new Date()): number | null {
  if (!iso) return null;
  const d = diaBrasilia(iso);
  const h = diaBrasilia(agora);
  if (!d || !h) return null;
  return Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${h}T12:00:00Z`)) / UM_DIA);
}

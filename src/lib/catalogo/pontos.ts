/**
 * Pontos do mapa de verdade (vista de mapa, MapLibre; GET /api/catalogo/pontos): TODOS os imóveis filtrados, não só a
 * página, num formato compacto em colunas. PURO (sem fs, sem rede, sem DOM): o servidor monta (`montarPontos`) e o
 * navegador lê (`lerPontos`) com as mesmas funções, testadas em pontos.test.ts.
 *
 * - Imóveis no mesmo ponto viram um LUGAR só: o mesmo prédio (171 apartamentos num endereço), o mesmo ponto de bairro
 *   e a sede da cidade. Os 21 mil imóveis da prévia viram ~9,7 mil lugares (menos pontos para o MapLibre agrupar e
 *   desenhar, e um cartão "3 imóveis neste endereço" em vez de alfinetes empilhados).
 * - Precisão (`nivel`): 0 no número, 1 na rua, 2 no bairro (ou CEP), 3 só na cidade (sede do município). Nível 2 e 3
 *   nunca viram alfinete exato: o 2 é um círculo de incerteza com o raio do desvio; o 3, um marcador "N imóveis sem
 *   endereço exato em <cidade>" na sede.
 * - Lugares em ordem Z (curva de Morton) e lat/lon em centésimos de milésimo de grau (~1 m), em diferenças: números
 *   pequenos, que o gzip comprime bem (~150 KB para o Brasil inteiro, contra ~300 KB com ids e coordenadas cruas).
 * - Cada imóvel vai pela POSIÇÃO no conjunto (`k`), não pelo id: o cartão do mapa pede o resto por k
 *   (GET /api/catalogo/pontos/itens), e `conjunto` (a versão da lista) diz em que versão o k vale.
 *
 * Sem imports com "@/" (os testes rodam em Node puro).
 */
import type { IndiceCatalogo } from "./consulta";
import type { PrecisaoGeo, TipoImovel } from "./tipos";

/** Versão do formato (o navegador recusa outra). */
export const VERSAO_PONTOS = 1;

/** Ordem dos tipos na coluna `tipo`. */
export const TIPOS_PONTO: readonly TipoImovel[] = ["apartamento", "casa", "terreno", "comercial", "rural", "outro"];

/** 0 no número, 1 na rua, 2 no bairro (ou CEP), 3 só na cidade. */
export type NivelPonto = 0 | 1 | 2 | 3;

export function nivelDaPrecisao(p: PrecisaoGeo | null): NivelPonto {
  switch (p) {
    case "exata":
      return 0;
    case "rua":
      return 1;
    case "bairro":
    case "cep":
      return 2;
    default:
      return 3;
  }
}

/**
 * Raio da incerteza (m) quando a base não tem o desvio do ponto: no número ~30 m (o lote), na rua ~200 m (meio de uma
 * rua comum), no bairro ~800 m (a mediana dos desvios de bairro da prévia é 780 m). Na cidade não há raio: o marcador
 * é o da sede, explicado na legenda.
 */
export const RAIO_PADRAO: Record<NivelPonto, number> = { 0: 30, 1: 200, 2: 800, 3: 0 };

/** Escala das coordenadas inteiras (1e5 ≈ 1,1 m no equador). */
const ESCALA = 1e5;

export interface PontosCompactos {
  versao: typeof VERSAO_PONTOS;
  /** versão da lista do conjunto (um resumo dos ids): `k` só vale nela */
  conjunto: string;
  /** imóveis no mapa (os filtrados que têm ponto) */
  total: number;
  /** imóveis filtrados sem ponto nenhum (não aparecem no mapa; a lista os tem) */
  semPonto: number;
  lugares: {
    /** latitude × 1e5, em diferenças (o primeiro é o valor; cada outro, a diferença para o anterior) */
    lat: number[];
    lon: number[];
    nivel: NivelPonto[];
    /** raio da incerteza em metros (0 no nível 3) */
    raio: number[];
    /** imóveis no lugar */
    n: number[];
  };
  /** nomes dos lugares aproximados (níveis 2 e 3), na ordem em que aparecem: "Centro, Uberlândia/MG", "Uberlândia/MG" */
  nomes: string[];
  /** os imóveis, lugar a lugar (os `n` do primeiro lugar, depois os do segundo...), o de maior deságio primeiro */
  imoveis: {
    /** posição no conjunto */
    k: number[];
    /** lance em centenas de reais */
    lance: number[];
    /** deságio em % (null sem avaliação) */
    desagio: (number | null)[];
    /** índice em TIPOS_PONTO */
    tipo: number[];
  };
}

/** Intercala os bits de x e y (16 bits cada): a ordem Z deixa pontos vizinhos perto na lista. */
function morton(x: number, y: number): number {
  let m = 0;
  for (let b = 15; b >= 0; b--) m = m * 4 + ((y >> b) & 1) * 2 + ((x >> b) & 1);
  return m;
}

export interface OpcoesPontos {
  /** versão da lista do conjunto (vai em `conjunto`) */
  conjunto: string;
  /** desvio do ponto do imóvel na posição k, em metros (null/NaN: usa RAIO_PADRAO) */
  raio?: (k: number) => number | null | undefined;
}

/**
 * Os pontos dos imóveis com máscara 0 (os que passam nos filtros; ver `aoFiltrar` em consulta.ts). Imóvel sem
 * coordenada fica de fora (conta em `semPonto`); valor fora do padrão (lance acima de 5× a avaliação) entra com o lance
 * dele, mas sem deságio (não pinta o mapa de "deságio alto" por erro da fonte).
 */
export function montarPontos(ix: IndiceCatalogo, mascaras: Int32Array, opcoes: OpcoesPontos): PontosCompactos {
  interface Lugar {
    la: number;
    lo: number;
    nivel: NivelPonto;
    raio: number;
    ks: number[];
    z: number;
  }
  const lugares = new Map<string, Lugar>();
  let semPonto = 0;
  let total = 0;
  for (let k = 0; k < ix.n; k++) {
    if (mascaras[k] !== 0) continue;
    const lat = ix.lat[k]!;
    const lon = ix.lon[k]!;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      semPonto++;
      continue;
    }
    total++;
    const item = ix.itens[k]!;
    const nivel = nivelDaPrecisao(item.precisaoGeo);
    const la = Math.round(lat * ESCALA);
    const lo = Math.round(lon * ESCALA);
    const chave = `${la},${lo},${nivel}`;
    let l = lugares.get(chave);
    if (!l) {
      // Z de 16 bits por eixo sobre o retângulo do mundo (o Brasil inteiro cabe em ~1/8 dele: sobra resolução)
      const x = Math.min(65535, Math.max(0, Math.floor(((lon + 180) / 360) * 65536)));
      const y = Math.min(65535, Math.max(0, Math.floor(((lat + 90) / 180) * 65536)));
      l = { la, lo, nivel, raio: 0, ks: [], z: morton(x, y) };
      lugares.set(chave, l);
    }
    l.ks.push(k);
    if (nivel < 3) {
      const r = opcoes.raio?.(k);
      const raio = typeof r === "number" && Number.isFinite(r) && r > 0 ? r : RAIO_PADRAO[nivel];
      // o lugar fica com o maior desvio dos imóveis dele (a área cobre todos)
      if (raio > l.raio) l.raio = raio;
    }
  }

  const ordenados = [...lugares.values()].sort((a, b) => a.z - b.z || a.la - b.la || a.lo - b.lo || a.nivel - b.nivel);
  const desagio = ix.numeros.desagio;
  const lance = ix.numeros.lance;
  const saida: PontosCompactos = {
    versao: VERSAO_PONTOS,
    conjunto: opcoes.conjunto,
    total,
    semPonto,
    lugares: { lat: [], lon: [], nivel: [], raio: [], n: [] },
    nomes: [],
    imoveis: { k: [], lance: [], desagio: [], tipo: [] },
  };
  let laAntes = 0;
  let loAntes = 0;
  const L = saida.lugares;
  const I = saida.imoveis;
  for (const l of ordenados) {
    L.lat.push(l.la - laAntes);
    L.lon.push(l.lo - loAntes);
    laAntes = l.la;
    loAntes = l.lo;
    L.nivel.push(l.nivel);
    L.raio.push(l.nivel === 3 ? 0 : Math.round(l.raio / 10) * 10);
    L.n.push(l.ks.length);
    if (l.nivel >= 2) {
      const i = ix.itens[l.ks[0]!]!;
      const cidade = `${i.cidade}/${i.uf}`;
      saida.nomes.push(l.nivel === 2 && i.bairro && i.bairro !== i.cidade ? `${i.bairro}, ${cidade}` : cidade);
    }
    // o de maior deságio primeiro (o cartão de um lugar com vários imóveis mostra os melhores)
    const des = (k: number) => (ix.suspeito[k] ? NaN : desagio[k]!);
    l.ks.sort((a, b) => {
      const da = des(a);
      const db = des(b);
      if (da !== db) return Number.isNaN(da) ? 1 : Number.isNaN(db) ? -1 : db - da;
      return ix.rankId[a]! - ix.rankId[b]!;
    });
    for (const k of l.ks) {
      I.k.push(k);
      I.lance.push(Math.round(lance[k]! / 100));
      const d = des(k);
      I.desagio.push(Number.isNaN(d) ? null : Math.round(d));
      I.tipo.push(Math.max(0, TIPOS_PONTO.indexOf(ix.itens[k]!.tipo)));
    }
  }
  return saida;
}

// ---------------------------------------------------------------------------
// Leitura (navegador)
// ---------------------------------------------------------------------------

/** Um lugar no mapa, pronto para virar Feature. */
export interface LugarMapa {
  /** índice do lugar (id da feature) */
  i: number;
  lat: number;
  lon: number;
  nivel: NivelPonto;
  /** raio da incerteza (m); 0 no nível 3 */
  raio: number;
  /** imóveis no lugar */
  n: number;
  /** nome do lugar aproximado ("Centro, Uberlândia/MG"); null no número e na rua */
  nome: string | null;
  /** onde os imóveis do lugar começam nas colunas de `imoveis` */
  inicio: number;
  /** menor lance (R$) */
  lanceMin: number;
  /** soma e quantidade dos deságios conhecidos (a média pinta o ponto e o agrupamento) */
  desagioSoma: number;
  desagioN: number;
}

export interface PontosLidos {
  conjunto: string;
  total: number;
  semPonto: number;
  lugares: LugarMapa[];
  /** colunas dos imóveis, na ordem dos lugares */
  k: Int32Array;
  /** lance em R$ */
  lance: Float64Array;
  /** deságio em % (NaN sem avaliação) */
  desagio: Float64Array;
  tipo: Uint8Array;
}

/** Lê o formato compacto (lança se a versão não for esta ou as colunas não baterem). */
export function lerPontos(p: PontosCompactos): PontosLidos {
  if (!p || p.versao !== VERSAO_PONTOS) throw new Error(`formato de pontos ${String(p?.versao)}; este site lê o ${VERSAO_PONTOS}`);
  const L = p.lugares;
  const m = L.lat.length;
  if (L.lon.length !== m || L.nivel.length !== m || L.raio.length !== m || L.n.length !== m) throw new Error("colunas dos lugares com tamanhos diferentes");
  const I = p.imoveis;
  const n = I.k.length;
  if (I.lance.length !== n || I.desagio.length !== n || I.tipo.length !== n) throw new Error("colunas dos imóveis com tamanhos diferentes");
  const k = Int32Array.from(I.k);
  const lance = Float64Array.from(I.lance, (x) => x * 100);
  const desagio = Float64Array.from(I.desagio, (x) => (x === null ? NaN : x));
  const tipo = Uint8Array.from(I.tipo);
  const lugares: LugarMapa[] = new Array(m);
  let la = 0;
  let lo = 0;
  let inicio = 0;
  let nome = 0;
  for (let i = 0; i < m; i++) {
    la += L.lat[i]!;
    lo += L.lon[i]!;
    const nivel = L.nivel[i]!;
    const qtd = L.n[i]!;
    let lanceMin = Infinity;
    let soma = 0;
    let comDesagio = 0;
    for (let j = inicio; j < inicio + qtd && j < n; j++) {
      if (lance[j]! < lanceMin) lanceMin = lance[j]!;
      const d = desagio[j]!;
      if (!Number.isNaN(d)) {
        soma += d;
        comDesagio++;
      }
    }
    lugares[i] = {
      i,
      lat: la / ESCALA,
      lon: lo / ESCALA,
      nivel,
      raio: L.raio[i]!,
      n: qtd,
      nome: nivel >= 2 ? (p.nomes[nome++] ?? null) : null,
      inicio,
      lanceMin: Number.isFinite(lanceMin) ? lanceMin : 0,
      desagioSoma: soma,
      desagioN: comDesagio,
    };
    inicio += qtd;
  }
  if (inicio !== n) throw new Error("a soma dos imóveis por lugar não bate com a coluna dos imóveis");
  return { conjunto: p.conjunto, total: p.total, semPonto: p.semPonto, lugares, k, lance, desagio, tipo };
}

/** As posições (k) dos imóveis de um lugar, na ordem do lugar (o de maior deságio primeiro). */
export function posicoesDoLugar(d: PontosLidos, l: LugarMapa): number[] {
  return Array.from(d.k.subarray(l.inicio, l.inicio + l.n));
}

// ---------------------------------------------------------------------------
// Geometria: metros → pixels (o raio da incerteza acompanha o zoom)
// ---------------------------------------------------------------------------

/** Metros por pixel no zoom 0 do MapLibre (ladrilhos de 512 px), no equador: 2πR / 512. */
export const METROS_POR_PIXEL_Z0 = 40_075_016.686 / 512;

/**
 * Raio em pixels no zoom 0 de um círculo de `metros` na latitude `lat`. No zoom z, o raio na tela é este × 2^z (a
 * expressão do estilo faz a conta: `["interpolate", ["exponential", 2], ["zoom"], 0, r0, 24, r0 × 2^24]`).
 */
export function raioPixelZ0(metros: number, lat: number): number {
  const cos = Math.cos((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return metros / (METROS_POR_PIXEL_Z0 * cos);
}

/** O raio na tela (px) num zoom (o mesmo que o estilo desenha). */
export function raioNaTela(metros: number, lat: number, zoom: number): number {
  return raioPixelZ0(metros, lat) * 2 ** zoom;
}

// ---------------------------------------------------------------------------
// Rótulos e cor pelo deságio
// ---------------------------------------------------------------------------

/**
 * Faixas de deságio da cor dos pontos e agrupamentos (média do lugar ou do agrupamento): sem avaliação, até 20%, de
 * 20% a 40%, de 40% a 60% e 60% ou mais. A legenda diz o mesmo.
 */
export const FAIXAS_DESAGIO = [20, 40, 60] as const;

/** Faixa (0 a 3) de um deságio médio; -1 sem deságio. */
export function faixaDesagio(media: number | null): -1 | 0 | 1 | 2 | 3 {
  if (media === null || !Number.isFinite(media)) return -1;
  if (media < FAIXAS_DESAGIO[0]) return 0;
  if (media < FAIXAS_DESAGIO[1]) return 1;
  if (media < FAIXAS_DESAGIO[2]) return 2;
  return 3;
}

const NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const NUM1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/**
 * Preço curto do marcador, sem "R$" (cabe no balão): "180 mil", "1,2 mi", "950". Arredonda para baixo no mil, para
 * nunca prometer menos do que o lance ("R$ 99,9 mil" não vira "100 mil").
 */
export function precoCurto(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return "";
  if (v >= 1_000_000) return `${NUM1.format(Math.floor(v / 100_000) / 10)} mi`;
  if (v >= 10_000) return `${NUM.format(Math.floor(v / 1000))} mil`;
  if (v >= 1000) return `${NUM1.format(Math.floor(v / 100) / 10)} mil`;
  return NUM.format(Math.floor(v));
}

/** Contagem curta do agrupamento: "8", "950", "1,2 mil", "21 mil". */
export function contagemCurta(n: number): string {
  if (n >= 10_000) return `${NUM.format(Math.floor(n / 1000))} mil`;
  if (n >= 1000) return `${NUM1.format(Math.floor(n / 100) / 10)} mil`;
  return NUM.format(n);
}

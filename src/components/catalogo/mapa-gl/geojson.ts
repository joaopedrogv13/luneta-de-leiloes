/**
 * Contas do mapa de verdade que não dependem do MapLibre (testadas em geojson.test.ts): os lugares viram GeoJSON, o
 * enquadramento dos resultados (sem que um imóvel perdido no mapa jogue a câmera para longe) e a área visível, que
 * vira o filtro "Buscar nesta área". Imports relativos (sem "@/"): o teste roda em Node puro.
 */
import { precoCurto, RAIO_PADRAO, raioPixelZ0, type LugarMapa, type PontosLidos } from "../../../lib/catalogo/pontos";
import type { CaixaGeo } from "../../../lib/catalogo/tipos";
import type { PropsLugar } from "./estilo";

/** O Brasil inteiro (com as ilhas oceânicas de fora: a câmera fica no continente). */
export const CAIXA_BRASIL: CaixaGeo = [-74.1, -33.8, -34.7, 5.3];

/** Texto do balão: "R$ 180 mil" (um imóvel) ou "3 imóveis" (o mesmo prédio). */
export function rotuloLugar(l: Pick<LugarMapa, "n" | "lanceMin">): string {
  return l.n > 1 ? `${l.n} imóveis` : `R$ ${precoCurto(l.lanceMin)}`;
}

/** Um imóvel sozinho como lugar (o mapa da página do imóvel usa as mesmas camadas do catálogo). */
export function featureDoImovel(i: {
  lat: number;
  lon: number;
  nivel: LugarMapa["nivel"];
  /** desvio do ponto (m); null usa o padrão do nível */
  raio: number | null;
  lance: number;
  desagio: number | null;
}): GeoJSON.Feature<GeoJSON.Point, PropsLugar> {
  const raio = i.nivel === 3 ? 0 : i.raio && i.raio > 0 ? i.raio : RAIO_PADRAO[i.nivel];
  const temDesagio = i.desagio !== null && Number.isFinite(i.desagio);
  return {
    type: "Feature",
    id: 0,
    geometry: { type: "Point", coordinates: [i.lon, i.lat] },
    properties: {
      i: 0,
      n: 1,
      nv: i.nivel,
      sd: temDesagio ? i.desagio! : 0,
      nd: temDesagio ? 1 : 0,
      r0: raio > 0 ? raioPixelZ0(raio, i.lat) : 0,
      rot: rotuloLugar({ n: 1, lanceMin: i.lance }),
      // um só: o círculo do bairro fica em qualquer zoom (no catálogo, de perto, ele some)
      fx: 1,
    },
  };
}

/**
 * Zoom que mostra o ponto com contexto: no número, a rua e as vizinhas (16,5); na rua, o trecho (15,5); no bairro, o
 * círculo inteiro ocupando ~60% da altura; só na cidade, a cidade (12).
 */
export function zoomDoImovel(nivel: LugarMapa["nivel"], raio: number | null, lat: number, alturaPx: number): number {
  if (nivel === 0) return 16.5;
  if (nivel === 1) return 15.5;
  if (nivel === 3) return 12;
  const r = raio && raio > 0 ? raio : RAIO_PADRAO[2];
  const z = Math.log2((alturaPx * 0.3) / raioPixelZ0(r, lat));
  return Math.max(11, Math.min(16, z));
}

/** Os lugares como FeatureCollection (id = índice do lugar; propriedades curtas: são ~10 mil). */
export function geojsonDosLugares(d: PontosLidos): GeoJSON.FeatureCollection<GeoJSON.Point, PropsLugar> {
  return {
    type: "FeatureCollection",
    features: d.lugares.map((l) => ({
      type: "Feature",
      id: l.i,
      geometry: { type: "Point", coordinates: [l.lon, l.lat] },
      properties: {
        i: l.i,
        n: l.n,
        nv: l.nivel,
        sd: l.desagioSoma,
        nd: l.desagioN,
        r0: l.raio > 0 ? raioPixelZ0(l.raio, l.lat) : 0,
        rot: rotuloLugar(l),
      },
    })),
  };
}

/**
 * O retângulo que enquadra os resultados: do percentil 2 ao 98 das coordenadas (pesadas pelo número de imóveis),
 * para um imóvel com endereço errado no meio do mar ou no outro lado do país não afastar a câmera. Com poucos lugares
 * (até 5), todos entram. Sem lugar: o Brasil.
 */
export function caixaDosLugares(lugares: readonly Pick<LugarMapa, "lat" | "lon" | "n">[], corte = 0.02): CaixaGeo {
  if (!lugares.length) return CAIXA_BRASIL;
  const total = lugares.reduce((s, l) => s + l.n, 0);
  const pontas = (valores: { v: number; n: number }[]): [number, number] => {
    valores.sort((a, b) => a.v - b.v);
    if (lugares.length <= 5) return [valores[0]!.v, valores[valores.length - 1]!.v];
    const lo = total * corte;
    const hi = total * (1 - corte);
    let soma = 0;
    let min = valores[0]!.v;
    let max = valores[valores.length - 1]!.v;
    let achouMin = false;
    for (const x of valores) {
      soma += x.n;
      if (!achouMin && soma > lo) {
        min = x.v;
        achouMin = true;
      }
      if (soma >= hi) {
        max = x.v;
        break;
      }
    }
    return [min, max];
  };
  const [oeste, leste] = pontas(lugares.map((l) => ({ v: l.lon, n: l.n })));
  const [sul, norte] = pontas(lugares.map((l) => ({ v: l.lat, n: l.n })));
  // um ponto só (ou todos no mesmo lugar): uma caixa de ~2 km em volta, para a câmera não ir ao zoom máximo
  const folga = 0.01;
  return [Math.min(oeste, leste - folga), Math.min(sul, norte - folga), Math.max(leste, oeste + folga), Math.max(norte, sul + folga)];
}

/** Arredonda a área visível (5 casas, ~1 m) e a mantém dentro do globo: é o filtro que vai para o servidor e a URL. */
export function caixaDaTela(oeste: number, sul: number, leste: number, norte: number): CaixaGeo {
  const r = (x: number) => Math.round(x * 1e5) / 1e5;
  const o = Math.max(-180, r(oeste));
  const l = Math.min(180, r(leste));
  const s = Math.max(-85, r(sul));
  const n = Math.min(85, r(norte));
  return [o, s, Math.max(l, o + 1e-5), Math.max(n, s + 1e-5)];
}

/** As duas áreas são praticamente a mesma (diferença menor que 2% do lado)? Evita buscar de novo por um tremor. */
export function mesmaArea(a: CaixaGeo | undefined | null, b: CaixaGeo | undefined | null): boolean {
  if (!a || !b) return a === b;
  const largura = Math.max(1e-9, b[2] - b[0]);
  const altura = Math.max(1e-9, b[3] - b[1]);
  return (
    Math.abs(a[0] - b[0]) < largura * 0.02 &&
    Math.abs(a[2] - b[2]) < largura * 0.02 &&
    Math.abs(a[1] - b[1]) < altura * 0.02 &&
    Math.abs(a[3] - b[3]) < altura * 0.02
  );
}

/** A frase da precisão de um lugar, para o cartão e o leitor de tela. */
export function textoPrecisao(l: Pick<LugarMapa, "nivel" | "raio" | "nome" | "n">): string {
  switch (l.nivel) {
    case 0:
      return l.n > 1 ? "Mesmo endereço, localizado no número" : "Endereço localizado no número";
    case 1:
      return `Posição aproximada pela rua (até ${metros(l.raio)} de distância)`;
    case 2:
      return `Posição aproximada: só o bairro é conhecido (o imóvel fica em algum ponto do círculo, de até ${metros(l.raio)})`;
    default:
      return `Sem endereço exato: o marcador fica no centro ${l.nome ? `de ${l.nome}` : "da cidade"}`;
  }
}

/** "300 m", "1,3 km". */
export function metros(m: number): string {
  if (m >= 1000) return `${(Math.round(m / 100) / 10).toLocaleString("pt-BR")} km`;
  return `${Math.round(m / 10) * 10} m`;
}

/**
 * Contas da câmera do mapa (funções puras, testadas em Node: sem "@/" nos imports).
 *
 * Mundo = o viewBox de src/lib/mapa/brasil-ufs.ts (2000×2101, Mercator). A câmera guarda o zoom `z`
 * (1 = Brasil inteiro cabendo na área útil) e o ponto do mundo que fica no centro da tela (`cx`, `cy`).
 * Tela = o retângulo do mapa em px, com folgas (controles, legenda) que o enquadramento respeita.
 *
 *   x_tela = (x_mundo − cx) · s + largura/2,   s = escalaBase(tela) · z
 */
import { UFS_MAPA } from "../../../lib/mapa/brasil-ufs";

export type Caixa = readonly [x0: number, y0: number, x1: number, y1: number];

export interface Camera {
  z: number;
  cx: number;
  cy: number;
}

export interface Folga {
  cima: number;
  dir: number;
  baixo: number;
  esq: number;
}

export interface Tela {
  w: number;
  h: number;
  folga: Folga;
}

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 14;
/** O enquadramento automático não passa disto (uma cidade só não vira um borrão de 14×). */
export const ZOOM_AUTO_MAX = 9;
/** Menor caixa que o enquadramento aceita, em unidades do mundo (~1,2° de lado): um ponto vira uma região. */
const CAIXA_MINIMA = 60;

const uniao = (caixas: Caixa[]): Caixa | null => {
  if (!caixas.length) return null;
  let [x0, y0, x1, y1] = caixas[0];
  for (const [a, b, c, d] of caixas) {
    if (a < x0) x0 = a;
    if (b < y0) y0 = b;
    if (c > x1) x1 = c;
    if (d > y1) y1 = d;
  }
  return [x0, y0, x1, y1];
};

/** Caixa justa do Brasil (união das 27 UFs), não o viewBox com margem. */
export const CAIXA_BRASIL: Caixa = uniao(Object.values(UFS_MAPA).map((u) => u.caixa))!;

export const clamp = (v: number, min: number, max: number) => (v < min ? min : v > max ? max : v);

/** px por unidade do mundo no zoom 1: o Brasil inteiro cabe na área útil (tela menos folgas). */
export function escalaBase(t: Tela): number {
  const aw = Math.max(1, t.w - t.folga.esq - t.folga.dir);
  const ah = Math.max(1, t.h - t.folga.cima - t.folga.baixo);
  return Math.min(aw / (CAIXA_BRASIL[2] - CAIXA_BRASIL[0]), ah / (CAIXA_BRASIL[3] - CAIXA_BRASIL[1]));
}

export const escala = (c: Camera, t: Tela) => escalaBase(t) * c.z;

/** Translação da câmera: x_tela = x_mundo · s + tx. */
export function translacao(c: Camera, t: Tela): { s: number; tx: number; ty: number } {
  const s = escala(c, t);
  return { s, tx: t.w / 2 - c.cx * s, ty: t.h / 2 - c.cy * s };
}

export function paraTela(x: number, y: number, c: Camera, t: Tela): [number, number] {
  const { s, tx, ty } = translacao(c, t);
  return [x * s + tx, y * s + ty];
}

export function paraMundo(sx: number, sy: number, c: Camera, t: Tela): [number, number] {
  const { s, tx, ty } = translacao(c, t);
  return [(sx - tx) / s, (sy - ty) / s];
}

/** Um eixo do limite: se o Brasil cabe na área útil, fica centrado nela; senão as bordas não entram na área. */
function limitarEixo(c: number, s: number, lo: number, hi: number, tamanho: number, folgaIni: number, folgaFim: number) {
  const area = tamanho - folgaIni - folgaFim;
  if ((hi - lo) * s <= area + 0.5) return (lo + hi) / 2 - (folgaIni + area / 2 - tamanho / 2) / s;
  return clamp(c, lo + (tamanho / 2 - folgaIni) / s, hi - (tamanho / 2 - folgaFim) / s);
}

/** Zoom entre 1× e 14× e o Brasil sempre na tela (não dá para arrastar o país para fora). */
export function limitar(c: Camera, t: Tela): Camera {
  const z = clamp(Number.isFinite(c.z) ? c.z : 1, ZOOM_MIN, ZOOM_MAX);
  const s = escalaBase(t) * z;
  const [x0, y0, x1, y1] = CAIXA_BRASIL;
  return {
    z,
    cx: limitarEixo(c.cx, s, x0, x1, t.w, t.folga.esq, t.folga.dir),
    cy: limitarEixo(c.cy, s, y0, y1, t.h, t.folga.cima, t.folga.baixo),
  };
}

/**
 * Câmera que mostra a caixa inteira na área útil (sem passar de `zMax`). `margem` (px) soma às folgas:
 * para pontos, o raio das bolhas, que não podem ficar cortadas na borda.
 */
export function enquadrar(caixa: Caixa, t: Tela, zMax = ZOOM_AUTO_MAX, margem = 0): Camera {
  let [x0, y0, x1, y1] = caixa;
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  if (x1 - x0 < CAIXA_MINIMA) [x0, x1] = [mx - CAIXA_MINIMA / 2, mx + CAIXA_MINIMA / 2];
  if (y1 - y0 < CAIXA_MINIMA) [y0, y1] = [my - CAIXA_MINIMA / 2, my + CAIXA_MINIMA / 2];
  const m = Math.max(0, Math.min(margem, (t.w - t.folga.esq - t.folga.dir) / 4, (t.h - t.folga.cima - t.folga.baixo) / 4));
  const esq = t.folga.esq + m;
  const cima = t.folga.cima + m;
  const aw = Math.max(1, t.w - t.folga.esq - t.folga.dir - 2 * m);
  const ah = Math.max(1, t.h - t.folga.cima - t.folga.baixo - 2 * m);
  const s0 = escalaBase(t);
  const z = clamp(Math.min(aw / (x1 - x0), ah / (y1 - y0)) / s0, ZOOM_MIN, Math.max(ZOOM_MIN, zMax));
  const s = s0 * z;
  return limitar(
    {
      z,
      cx: mx - (esq + aw / 2 - t.w / 2) / s,
      cy: my - (cima + ah / 2 - t.h / 2) / s,
    },
    t,
  );
}

/**
 * Enquadramento automático dos resultados: a caixa com margem; se quase não aproxima (resultados no país
 * todo), mostra o Brasil inteiro, que lê melhor do que um zoom de 1,2×.
 */
export function enquadrarResultados(caixa: Caixa, t: Tela, margem = 0): Camera {
  const c = enquadrar(caixa, t, ZOOM_AUTO_MAX, margem);
  return c.z < 1.3 ? cameraBrasil(t) : c;
}

/** Câmera do Brasil inteiro (zoom 1). */
export function cameraBrasil(t: Tela): Camera {
  return enquadrar(CAIXA_BRASIL, t, ZOOM_MIN);
}

/** Aproxima (fator > 1) ou afasta mantendo parado o ponto da tela (sx, sy): roda do mouse, duplo clique. */
export function zoomNoPonto(c: Camera, t: Tela, fator: number, sx: number, sy: number): Camera {
  const [wx, wy] = paraMundo(sx, sy, c, t);
  const z = clamp(c.z * fator, ZOOM_MIN, ZOOM_MAX);
  const s = escalaBase(t) * z;
  return limitar({ z, cx: wx - (sx - t.w / 2) / s, cy: wy - (sy - t.h / 2) / s }, t);
}

/** Move a câmera em px de tela (setas, arrasto). */
export function moverPx(c: Camera, t: Tela, dx: number, dy: number): Camera {
  const s = escala(c, t);
  return limitar({ z: c.z, cx: c.cx - dx / s, cy: c.cy - dy / s }, t);
}

/**
 * Caminho entre duas câmeras: zoom em escala logarítmica e o centro girando em volta do ponto fixo das
 * duas vistas (o único ponto que fica no mesmo lugar da tela no começo e no fim). Aproximar de uma região
 * que já está na tela parece "mergulhar" nela, sem o desvio de interpolar o centro em linha reta.
 */
export function interpolar(a: Camera, b: Camera, p: number): Camera {
  if (p <= 0) return a;
  if (p >= 1) return b;
  const z = Math.exp(Math.log(a.z) + (Math.log(b.z) - Math.log(a.z)) * p);
  // escalas proporcionais a z (a escala base é a mesma nas duas pontas)
  if (Math.abs(b.z - a.z) / a.z < 1e-3) {
    return { z, cx: a.cx + (b.cx - a.cx) * p, cy: a.cy + (b.cy - a.cy) * p };
  }
  const fx = (b.cx * b.z - a.cx * a.z) / (b.z - a.z);
  const fy = (b.cy * b.z - a.cy * a.z) / (b.z - a.z);
  return { z, cx: fx - ((fx - a.cx) * a.z) / z, cy: fy - ((fy - a.cy) * a.z) / z };
}

/** Caixa (no mundo) de uma lista de pontos já projetados. */
export function caixaDosPontos(pontos: readonly { x: number; y: number }[]): Caixa | null {
  if (!pontos.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const { x, y } of pontos) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

/** Caixa das UFs (siglas desconhecidas são ignoradas). */
export function caixaDasUfs(ufs: readonly string[]): Caixa | null {
  return uniao(ufs.map((uf) => UFS_MAPA[uf.toUpperCase()]?.caixa).filter((c): c is Caixa => !!c));
}

export const mesmaCamera = (a: Camera, b: Camera) =>
  Math.abs(a.z - b.z) < 1e-6 && Math.abs(a.cx - b.cx) < 1e-4 && Math.abs(a.cy - b.cy) < 1e-4;

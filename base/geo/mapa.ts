/**
 * Posição no mapa do site. É a mesma projeção de `latLonToMap` em src/lib/brazil.ts (Mercator
 * calibrado nas capitais, viewBox 400×400 do contorno BRAZIL_PATH), copiada para a base rodar
 * sem depender do código do site; mapa.test.ts compara as duas em todas as sedes do IBGE e falha
 * se o site mudar os coeficientes.
 */

/** Tamanho do viewBox do mapa do site. */
export const LADO_MAPA = 400;

/** [x, y] no viewBox 400×400, com uma casa decimal (igual ao site). */
export function latLonParaMapa(lat: number, lon: number): [number, number] {
  const x = 8.7411 * lon + 675.197;
  const y = -501.1798 * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) + 65.883;
  return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
}

/** Posição no mapa, ou `null` sem coordenada ou fora do viewBox. */
export function posicaoNoMapa(lat: number | null | undefined, lon: number | null | undefined): [number, number] | null {
  if (lat === null || lat === undefined || lon === null || lon === undefined || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const [x, y] = latLonParaMapa(lat, lon);
  if (x < 0 || x > LADO_MAPA || y < 0 || y > LADO_MAPA) return null;
  return [x, y];
}

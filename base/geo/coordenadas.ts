/**
 * Utilidades de coordenadas (graus decimais, WGS 84).
 */

/** Retângulo que contém o território brasileiro, ilhas oceânicas incluídas (Trindade, Noronha, Rocas). */
export const LIMITES_BRASIL = { latMin: -34.0, latMax: 5.5, lonMin: -74.1, lonMax: -28.6 } as const;

export function coordenadaValida(lat: unknown, lon: unknown): boolean {
  return typeof lat === "number" && typeof lon === "number" && Number.isFinite(lat) && Number.isFinite(lon)
    && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

/** A coordenada cai no retângulo do Brasil? (Grosseiro: pega sinal trocado, lat/lon invertidas e 0,0.) */
export function dentroDoBrasil(lat: number, lon: number): boolean {
  return lat >= LIMITES_BRASIL.latMin && lat <= LIMITES_BRASIL.latMax && lon >= LIMITES_BRASIL.lonMin && lon <= LIMITES_BRASIL.lonMax;
}

/** Distância em km pela fórmula de haversine (raio médio da Terra, 6.371 km). */
export function distanciaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Arredonda para `casas` decimais (6 casas ≈ 10 cm). */
export function arredondarCoordenada(valor: number, casas = 6): number {
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}

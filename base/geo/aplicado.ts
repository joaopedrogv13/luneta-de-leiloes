/**
 * Geocodificação aplicada por endereço (base/fontes/localizacao): o que fica no banco e como ela sobrevive à próxima
 * coleta.
 *
 * `npm run base:geocode` (base/fontes/localizacao/aplicar.ts) grava `lat`, `lon` e `precisao_geo` na linha do imóvel e
 * o resto em `extras.geo` (precisão do geocode, desvio, setor censitário, motivo do rebaixamento, degrau, data e a
 * assinatura do endereço). Uma coleta nova do CSV da Caixa regrava a linha inteira com a sede do município (a Caixa não
 * traz coordenada): `manterGeocode` devolve o ponto aplicado enquanto o endereço for o mesmo (mesma assinatura) e a
 * fonte continuar sem coordenada. Endereço mudou → o ponto antigo cai e a sede volta até o próximo geocode.
 */
import type { PrecisaoGeo } from "../tipos.ts";
import { hashTexto } from "../util/hash.ts";

/** Chave de `extras` com o geocode aplicado. */
export const CHAVE_GEO = "geo";

/** Precisão do geocode (geocodificar.py) → precisão gravada no banco e mostrada no site. */
export const PRECISAO_DO_GEOCODE: Readonly<Record<string, PrecisaoGeo>> = { numero: "exata", rua: "rua", bairro: "bairro", cidade: "cidade" };

/** O que fica em `extras.geo`. */
export interface GeoAplicado {
  /** numero | rua | bairro | cidade (a do geocode; no banco, numero vira "exata") */
  precisao: string;
  desvio_m: number | null;
  setor: string | null;
  motivo: string | null;
  degrau: string | null;
  /** dia em que o geocode foi gerado (AAAA-MM-DD) */
  gerado_em: string;
  /** assinatura do endereço usado (assinaturaEndereco) */
  assinatura: string;
}

/** UF, cidade, bairro e endereço como foram geocodificados, em 16 caracteres de hash. */
export function assinaturaEndereco(d: { uf: string; cidade: string; bairro?: string | null; endereco?: string | null }): string {
  const texto = [d.uf, d.cidade, d.bairro ?? "", d.endereco ?? ""].map((x) => x.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase()).join("|");
  return hashTexto(texto).slice(0, 16);
}

/** `extras.geo` de um JSON de extras, ou null se não houver (ou se estiver malformado). */
export function lerGeoAplicado(extras: string | Record<string, unknown> | null | undefined): GeoAplicado | null {
  let obj: Record<string, unknown> | null = null;
  if (typeof extras === "string") {
    try {
      obj = JSON.parse(extras) as Record<string, unknown>;
    } catch {
      return null;
    }
  } else obj = extras ?? null;
  const g = obj?.[CHAVE_GEO] as GeoAplicado | undefined;
  return g && typeof g === "object" && typeof g.precisao === "string" && typeof g.assinatura === "string" ? g : null;
}

export interface GeoGravado {
  lat: number | null;
  lon: number | null;
  precisao_geo: string | null;
  extras: string | null;
}

/**
 * Na regravação de um imóvel pela coleta: se a linha nova só tem a sede do município (precisão "cidade") e a gravada
 * tem um geocode aplicado para o mesmo endereço, devolve lat, lon, precisão e extras com o geocode mantido. Senão,
 * null (fica a linha nova).
 */
export function manterGeocode(
  nova: { uf: string; cidade: string; bairro: string | null; endereco: string | null } & GeoGravado,
  gravada: GeoGravado,
): GeoGravado | null {
  if (nova.precisao_geo !== "cidade") return null;
  const geo = lerGeoAplicado(gravada.extras);
  if (!geo || geo.assinatura !== assinaturaEndereco(nova)) return null;
  let extras: Record<string, unknown> = {};
  try {
    extras = nova.extras ? (JSON.parse(nova.extras) as Record<string, unknown>) : {};
  } catch {
    extras = {};
  }
  extras[CHAVE_GEO] = geo;
  const comPonto = geo.precisao !== "cidade" && gravada.lat !== null && gravada.lon !== null && gravada.precisao_geo !== null;
  return comPonto
    ? { lat: gravada.lat, lon: gravada.lon, precisao_geo: gravada.precisao_geo, extras: JSON.stringify(extras) }
    : { lat: nova.lat, lon: nova.lon, precisao_geo: nova.precisao_geo, extras: JSON.stringify(extras) };
}

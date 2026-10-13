/**
 * Geocodificação de imóveis.
 *
 * - Coordenada da fonte (ex.: Street View da Leilões Judiciais): é conferida (dentro do Brasil e a
 *   no máximo `raio_km` + folga da sede do município) e vale com a precisão que o conector
 *   informou, ou "exata" se ele não informou. Lat/lon invertidas são desinvertidas quando a
 *   inversão cai no município certo; coordenada impossível é descartada.
 * - Sem coordenada (ex.: Caixa) ou com coordenada descartada: sede do município pela cidade + UF
 *   (tabela do IBGE em municipios.ts), com precisão "cidade" (no contrato da base, "cidade" é o
 *   nível de município: o ponto é a sede, não o imóvel).
 * - Cidade não reconhecida: fica sem coordenada (o site não põe no mapa) e a gravação avisa.
 */
import type { PrecisaoGeo } from "../tipos.ts";
import { arredondarCoordenada, coordenadaValida, dentroDoBrasil, distanciaKm } from "./coordenadas.ts";
import { tabelaPadrao, type MetodoMunicipio, type Municipio, type TabelaMunicipios } from "./municipios.ts";

/** Precisão gravada quando o ponto é a sede do município (o contrato chama esse nível de "cidade"). */
export const PRECISAO_MUNICIPIO: PrecisaoGeo = "cidade";
/** Precisão padrão de coordenada vinda da fonte sem precisão declarada. */
export const PRECISAO_FONTE_PADRAO: PrecisaoGeo = "exata";

/** Raio usado quando o município não tem raio_km (criado depois da malha), em km. */
const RAIO_PADRAO_KM = 100;
/** Folga sobre o raio do município (imóvel na divisa, sede imprecisa), em km. */
const FOLGA_KM = 10;

export interface EntradaGeo {
  uf: string;
  cidade: string;
  lat?: number | null;
  lon?: number | null;
  precisao_geo?: PrecisaoGeo | null;
}

export interface ResultadoGeo {
  lat: number | null;
  lon: number | null;
  precisao_geo: PrecisaoGeo | null;
  /** Código IBGE do município reconhecido (mesmo quando a coordenada veio da fonte). */
  codigo_ibge: string | null;
  /** De onde veio o ponto. */
  origem: "fonte" | "municipio" | "nenhuma";
  /** Como o município foi reconhecido (municipios.ts), ou null. */
  metodo_municipio: MetodoMunicipio | null;
  /** Problema para o log da coleta: cidade não reconhecida, coordenada descartada ou invertida. */
  alerta: string | null;
}

/** Distância máxima aceitável entre um ponto do município e a sede. */
export function limiteKm(municipio: Municipio): number {
  return (municipio.raio_km ?? RAIO_PADRAO_KM) + FOLGA_KM;
}

function pontoDoMunicipio(municipio: Municipio, metodo: MetodoMunicipio, alerta: string | null): ResultadoGeo {
  return {
    lat: municipio.lat,
    lon: municipio.lon,
    precisao_geo: PRECISAO_MUNICIPIO,
    codigo_ibge: municipio.codigo_ibge,
    origem: "municipio",
    metodo_municipio: metodo,
    alerta,
  };
}

/** Posição de um imóvel: coordenada da fonte conferida, senão sede do município, senão nada. */
export function geocodificar(entrada: EntradaGeo, tabela: TabelaMunicipios = tabelaPadrao()): ResultadoGeo {
  const achado = tabela.encontrar(entrada.uf, entrada.cidade);
  const municipio = achado?.municipio ?? null;
  const metodo = achado?.metodo ?? null;
  const onde = `"${entrada.cidade}"/${entrada.uf}`;

  const temFonte = entrada.lat !== null && entrada.lat !== undefined && entrada.lon !== null && entrada.lon !== undefined;
  let descarte: string | null = null;
  if (temFonte) {
    const lat = entrada.lat as number;
    const lon = entrada.lon as number;
    const candidatos: Array<{ lat: number; lon: number; invertida: boolean }> = [
      { lat, lon, invertida: false },
      { lat: lon, lon: lat, invertida: true },
    ];
    for (const c of candidatos) {
      if (!coordenadaValida(c.lat, c.lon) || !dentroDoBrasil(c.lat, c.lon)) continue;
      // Sem município reconhecido, só a coordenada como veio (não há como conferir a inversão).
      if (!municipio && c.invertida) continue;
      if (municipio && distanciaKm(c.lat, c.lon, municipio.lat, municipio.lon) > limiteKm(municipio)) continue;
      const alertas = [
        c.invertida ? `lat/lon invertidas na fonte (${lat}, ${lon}) para ${onde}; corrigido` : null,
        !municipio ? `cidade não reconhecida: ${onde} (coordenada da fonte mantida sem conferência)` : null,
      ].filter((a): a is string => a !== null);
      return {
        lat: arredondarCoordenada(c.lat),
        lon: arredondarCoordenada(c.lon),
        precisao_geo: entrada.precisao_geo ?? PRECISAO_FONTE_PADRAO,
        codigo_ibge: municipio?.codigo_ibge ?? null,
        origem: "fonte",
        metodo_municipio: metodo,
        alerta: alertas.length > 0 ? alertas.join("; ") : null,
      };
    }
    descarte = municipio
      ? `coordenada da fonte (${lat}, ${lon}) longe de ${municipio.nome}/${municipio.uf} (mais de ${Math.round(limiteKm(municipio))} km da sede); usada a sede do município`
      : `coordenada da fonte (${lat}, ${lon}) fora do Brasil para ${onde}; descartada`;
  }

  if (municipio && metodo) return pontoDoMunicipio(municipio, metodo, descarte);
  const alertas = [descarte, `cidade não reconhecida: ${onde}; imóvel sem coordenada`].filter((a): a is string => a !== null);
  return { lat: null, lon: null, precisao_geo: null, codigo_ibge: null, origem: "nenhuma", metodo_municipio: null, alerta: alertas.join("; ") };
}

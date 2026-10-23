/**
 * Estilo do mapa de verdade (MapLibre GL JS + ladrilhos vetoriais do OpenFreeMap), claro e escuro, nas cores do site.
 *
 * - Base: feita a partir do Positron do OpenFreeMap (github.com/hyperknot/openfreemap-styles, BSD-3 / CC BY 4.0), o
 *   estilo "limpo" deles, com as cores trocadas pelos tokens do site (globals.css: noite, tinta, luar, névoa) e os nomes
 *   em português (`name:pt` nos lugares; o nome local nas ruas). Sem ícones (nenhum sprite a baixar): bairros e cidades
 *   aparecem antes, os nomes das ruas a partir do zoom 13 (avenidas) e 14,5 (ruas), o número das casas a partir do 17,5,
 *   e os pontos de interesse ficam discretos (estações de trem e metrô a partir do 13, o resto a partir do 16).
 * - Camadas dos imóveis (prefixo "lu-"), por cima da base: agrupamentos com a contagem, pontos e preços, o círculo de
 *   incerteza do endereço aproximado (bairro) e o marcador "sem endereço exato" (cidade), pintados pelo deságio médio
 *   numa escala do latão (o único acento do site). As mesmas cores vão para a legenda (CORES_DESAGIO).
 * - O OpenFreeMap não pede chave nem tem limite e permite uso comercial; pede a atribuição, que vai na fonte dos
 *   ladrilhos (o controle do MapLibre a mostra no canto). Termos e endereços em PENDENCIAS.md (Rodada 5 · mapa).
 *
 * Puro (sem maplibre-gl em tempo de execução): o teste valida o estilo com a especificação do MapLibre.
 */
import type {
  CircleLayerSpecification,
  DataDrivenPropertyValueSpecification,
  ExpressionSpecification,
  LayerSpecification,
  StyleSpecification,
  SymbolLayerSpecification,
} from "maplibre-gl";
import { FAIXAS_DESAGIO, raioPixelZ0 } from "../../../lib/catalogo/pontos";

export type TemaMapa = "claro" | "escuro";

/** Ladrilhos, fontes e atribuição do OpenFreeMap (instância pública: sem chave, sem cookies, sem limite). */
export const OPENFREEMAP = {
  tilejson: "https://tiles.openfreemap.org/planet",
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
} as const;

/** "© OpenMapTiles © colaboradores do OpenStreetMap" (e o OpenFreeMap, que pede, mas não exige). */
export const ATRIBUICAO =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> ' +
  '<a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a> ' +
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© colaboradores do OpenStreetMap</a>';

const FONTE = ["Noto Sans Regular"];
const FONTE_NEGRITO = ["Noto Sans Bold"];
const FONTE_ITALICO = ["Noto Sans Italic"];

interface PaletaBase {
  terra: string;
  agua: string;
  parque: string;
  mata: string;
  residencial: string;
  predio: string;
  predioBorda: string;
  ruaMenor: string;
  ruaMenorBorda: string;
  via: string;
  viaBorda: string;
  rodovia: string;
  rodoviaBorda: string;
  trilho: string;
  limite: string;
  limiteEstado: string;
  textoRua: string;
  textoBairro: string;
  textoCidade: string;
  textoEstado: string;
  textoPais: string;
  textoAgua: string;
  textoPoi: string;
  textoEstacao: string;
  halo: string;
}

const BASE: Record<TemaMapa, PaletaBase> = {
  // escuro: terra no tom da "tinta" do site, água no da "noite"; ruas em ardósia (o latão fica só com os imóveis)
  escuro: {
    terra: "#0e1630",
    agua: "#070c1c",
    parque: "#0f1f2c",
    mata: "#0f1d2b",
    residencial: "#111a37",
    predio: "#151f3e",
    predioBorda: "#1c2849",
    ruaMenor: "#1b2648",
    ruaMenorBorda: "#141d3a",
    via: "#26335c",
    viaBorda: "#18213f",
    rodovia: "#33416f",
    rodoviaBorda: "#1d2747",
    trilho: "#2c3760",
    limite: "#4b5779",
    limiteEstado: "#36415f",
    textoRua: "#a7b2ca",
    textoBairro: "#8792ad",
    textoCidade: "#dfe6f6",
    textoEstado: "#76819d",
    textoPais: "#9aa6c0",
    textoAgua: "#5d6d93",
    textoPoi: "#8590ab",
    textoEstacao: "#aebde0",
    halo: "#0e1630",
  },
  // claro: o papel quente do site (#f3f0e8), água azul-acinzentada, ruas brancas com borda quente
  claro: {
    terra: "#f6f3ec",
    agua: "#c9d7e3",
    parque: "#dfe8d4",
    mata: "#dbe4cf",
    residencial: "#f1ede4",
    predio: "#e9e4d9",
    predioBorda: "#dcd5c7",
    ruaMenor: "#ffffff",
    ruaMenorBorda: "#e3dccf",
    via: "#ffffff",
    viaBorda: "#d8cebb",
    rodovia: "#fbf4e2",
    rodoviaBorda: "#d6c59c",
    trilho: "#c7c0b1",
    limite: "#b3aa97",
    limiteEstado: "#c6bead",
    textoRua: "#565f73",
    textoBairro: "#7d8496",
    textoCidade: "#0f1830",
    textoEstado: "#737b8e",
    textoPais: "#4f5a72",
    textoAgua: "#5f7d99",
    textoPoi: "#727a8c",
    textoEstacao: "#33507a",
    halo: "#ffffff",
  },
};

/**
 * Cores dos imóveis pelo deságio médio (sem avaliação, até 20%, 20–40%, 40–60%, 60% ou mais): mais deságio, mais forte
 * (no escuro, mais claro e brilhante; no claro, mais escuro). `texto`: a cor do número sobre a bolha (contraste ≥ 4,5:1
 * nas duas primeiras faixas do escuro e ≥ 3:1, texto grande em negrito, nas outras).
 */
export const CORES_DESAGIO: Record<TemaMapa, { fundo: string[]; texto: string[]; borda: string; destaque: string; cidadeFundo: string }> = {
  escuro: {
    fundo: ["#6c7792", "#8c7646", "#b08e47", "#c9a24d", "#f3da8e"],
    texto: ["#070b16", "#070b16", "#070b16", "#070b16", "#070b16"],
    borda: "#070b16",
    destaque: "#eaf0ff",
    cidadeFundo: "#0f1830",
  },
  claro: {
    fundo: ["#9aa3b5", "#d8bb78", "#c9a24d", "#97752b", "#664d12"],
    texto: ["#0f1830", "#0f1830", "#0f1830", "#ffffff", "#ffffff"],
    borda: "#ffffff",
    destaque: "#0f1830",
    cidadeFundo: "#ffffff",
  },
};

/** Rótulos da legenda, na ordem de CORES_DESAGIO.fundo. */
export const ROTULOS_DESAGIO = [
  "Sem avaliação",
  `Até ${FAIXAS_DESAGIO[0]}%`,
  `${FAIXAS_DESAGIO[0]}% a ${FAIXAS_DESAGIO[1]}%`,
  `${FAIXAS_DESAGIO[1]}% a ${FAIXAS_DESAGIO[2]}%`,
  `${FAIXAS_DESAGIO[2]}% ou mais`,
] as const;

// ---------------------------------------------------------------------------
// Expressões
// ---------------------------------------------------------------------------

/** Nome em português nos lugares (país, estado, cidade, bairro); o nome local onde não houver. */
const NOME_PT: ExpressionSpecification = ["coalesce", ["get", "name:pt"], ["get", "name:latin"], ["get", "name"]];
/** Ruas e rios: o nome local (é o que está na placa). */
const NOME_LOCAL: ExpressionSpecification = ["coalesce", ["get", "name"], ["get", "name:latin"]];

const linhas: ExpressionSpecification = ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false];
const poligonos: ExpressionSpecification = ["match", ["geometry-type"], ["MultiPolygon", "Polygon"], true, false];

/** Índice da faixa de deságio (0 = sem avaliação, 1 a 4) a partir da soma e da quantidade (ponto ou agrupamento). */
const FAIXA: ExpressionSpecification = [
  "case",
  ["==", ["get", "nd"], 0],
  0,
  ["step", ["/", ["get", "sd"], ["get", "nd"]], 1, FAIXAS_DESAGIO[0], 2, FAIXAS_DESAGIO[1], 3, FAIXAS_DESAGIO[2], 4],
];

const porFaixa = (cores: readonly string[]): ExpressionSpecification => ["match", FAIXA, 0, cores[0]!, 1, cores[1]!, 2, cores[2]!, 3, cores[3]!, cores[4]!];

/** Nome da imagem do balão de preço da faixa (gerada pelo mapa: `imagemPilula`). */
export const PREFIXO_PILULA = "lu-pilula-";
const PILULA: ExpressionSpecification = ["concat", PREFIXO_PILULA, ["to-string", FAIXA]];

/**
 * Imagem transparente (quadrado de TAMANHO_BLOQUEIO px, gerada pelo mapa) sob a contagem das bolhas: ocupa o lugar da
 * bolha na disputa por espaço dos rótulos, e o nome da cidade do mapa de fundo desvia para o lado (ou some) em vez de
 * ficar escondido embaixo dela ("Rio d(1)eiro").
 */
export const IMAGEM_BLOQUEIO = "lu-bloqueio";
export const TAMANHO_BLOQUEIO = 32;

/** Raio (px) da bolha pela quantidade de imóveis: [raio inicial, n1, raio1, n2, raio2...] (como no `step`). */
const RAIO_BOLHA_AGRUPAMENTO = [14, 10, 16, 50, 19, 200, 22, 1000, 25, 5000, 28] as const;
const RAIO_BOLHA_CIDADE = [12, 10, 14, 50, 17, 200, 20] as const;
const BORDA_BOLHA = 2.5;

/** O `step` do raio pela quantidade (`n`), com uma conta em cada degrau (o raio, o tamanho do bloqueio...). */
function porQuantidade(degraus: readonly number[], conta: (raio: number) => number): ExpressionSpecification {
  const [primeiro, ...resto] = degraus;
  const saida: (number | ExpressionSpecification)[] = [conta(primeiro!)];
  for (let k = 0; k < resto.length; k += 2) saida.push(resto[k]!, conta(resto[k + 1]!));
  return ["step", ["get", "n"], ...saida] as unknown as ExpressionSpecification;
}
const tamanhoBloqueio = (degraus: readonly number[]) => porQuantidade(degraus, (r) => (2 * (r + BORDA_BOLHA)) / TAMANHO_BLOQUEIO);

/**
 * Círculo de incerteza (bairro) só até este raio na tela (px): de perto ele passaria da tela, sem dizer mais nada (o
 * imóvel está em algum lugar da tela inteira), e dezenas deles, um sobre o outro, pesam na placa de vídeo do celular
 * (no Rio, no zoom 16, eram 169 círculos com raio mediano de 760 px, cada um pintado por inteiro).
 * Filtro e opacidade valem por zoom inteiro (o do ladrilho; no meio, a placa de vídeo interpola): de INICIO_SUMIR até
 * este raio ele vai sumindo e, no zoom inteiro em que passa dele, já está transparente e sai do desenho. O rótulo
 * "N imóveis no bairro" continua no centro (e abre o cartão). Na página do imóvel (um só, `fx`), o círculo fica sempre.
 */
export const RAIO_MAX_INCERTEZA = 220;
const INICIO_SUMIR = 140;

/**
 * Raio de um círculo em METROS na tela (px), com um mínimo: `r0` (px no zoom 0, calculado por ponto com a latitude:
 * raioPixelZ0) × 2^zoom. Paradas a cada 2 zooms (exatas na curva; o mínimo só vale perto do zoom em que ele aparece).
 */
function raioEmMetros(minimoPx: number): DataDrivenPropertyValueSpecification<number> {
  const paradas: (number | ExpressionSpecification)[] = [];
  for (let z = 0; z <= 24; z += 2) paradas.push(z, ["max", minimoPx, ["*", ["get", "r0"], 2 ** z]]);
  return ["interpolate", ["exponential", 2], ["zoom"], ...paradas] as unknown as DataDrivenPropertyValueSpecification<number>;
}

/**
 * Opacidade do círculo de incerteza: a do zoom (de `em10` no zoom 10 a `em16` no 16) × o quanto falta para o círculo
 * chegar a RAIO_MAX_INCERTEZA na tela (some entre INICIO_SUMIR e ele). Uma parada por zoom inteiro (a mesma conta do
 * filtro, que só entra no desenho o que ainda não passou do máximo); `fx` (página do imóvel) não some.
 */
function opacidadeIncerteza(em10: number, em16: number): DataDrivenPropertyValueSpecification<number> {
  const paradas: (number | ExpressionSpecification)[] = [];
  for (let z = 0; z <= 22; z++) {
    const base = z <= 10 ? em10 : z >= 16 ? em16 : em10 + ((em16 - em10) * (z - 10)) / 6;
    const falta: ExpressionSpecification = [
      "min",
      1,
      ["max", ["coalesce", ["get", "fx"], 0], ["/", ["-", RAIO_MAX_INCERTEZA, ["*", ["get", "r0"], 2 ** z]], RAIO_MAX_INCERTEZA - INICIO_SUMIR]],
    ];
    paradas.push(z, ["*", Math.round(base * 1000) / 1000, falta]);
  }
  return ["interpolate", ["linear"], ["zoom"], ...paradas] as unknown as DataDrivenPropertyValueSpecification<number>;
}

/** Contagem curta no agrupamento: "8", "950", "1,2 mil", "21 mil" (como contagemCurta, em src/lib/catalogo/pontos.ts). */
const CONTAGEM: ExpressionSpecification = [
  "case",
  [">=", ["get", "n"], 10000],
  ["concat", ["to-string", ["floor", ["/", ["get", "n"], 1000]]], " mil"],
  [">=", ["get", "n"], 1000],
  ["concat", ["number-format", ["/", ["floor", ["/", ["get", "n"], 100]], 10], { locale: "pt-BR", "max-fraction-digits": 1 }], " mil"],
  ["to-string", ["get", "n"]],
];

const agrupado: ExpressionSpecification = ["has", "point_count"];
const solto = (niveis: number[]): ExpressionSpecification => ["all", ["!", ["has", "point_count"]], ["match", ["get", "nv"], niveis, true, false]];

// ---------------------------------------------------------------------------
// Base
// ---------------------------------------------------------------------------

/**
 * Nomes de lugares do fundo que desviam das bolhas dos imóveis: no centro quando cabem; se uma bolha (ou um balão) estiver
 * em cima, vão para cima, para baixo ou para o lado; sem espaço, somem (nunca ficam cortados embaixo de uma bolha).
 */
const DESVIA = { "text-variable-anchor": ["center", "top", "bottom", "right", "left"], "text-radial-offset": 1.3 } satisfies SymbolLayerSpecification["layout"];

function camadasBase(p: PaletaBase): LayerSpecification[] {
  const s = "openmaptiles";
  const texto = (cor: string, largura = 1.2) => ({ "text-color": cor, "text-halo-color": p.halo, "text-halo-width": largura, "text-halo-blur": 0.5 });
  return [
    { id: "fundo", type: "background", paint: { "background-color": p.terra } },
    { id: "residencial", type: "fill", source: s, "source-layer": "landuse", maxzoom: 16, filter: ["all", poligonos, ["==", ["get", "class"], "residential"]], paint: { "fill-color": p.residencial, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 8, 0.8, 12, 0.5] } },
    { id: "mata", type: "fill", source: s, "source-layer": "landcover", minzoom: 8, filter: ["all", poligonos, ["==", ["get", "class"], "wood"]], paint: { "fill-color": p.mata, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 8, 0, 12, 1] } },
    { id: "parque", type: "fill", source: s, "source-layer": "park", filter: poligonos, paint: { "fill-color": p.parque } },
    { id: "agua", type: "fill", source: s, "source-layer": "water", filter: ["all", poligonos, ["!=", ["get", "brunnel"], "tunnel"]], paint: { "fill-color": p.agua } },
    { id: "rio", type: "line", source: s, "source-layer": "waterway", filter: linhas, paint: { "line-color": p.agua, "line-width": ["interpolate", ["exponential", 1.3], ["zoom"], 8, 0.5, 14, 2, 20, 6] } },
    { id: "predio", type: "fill", source: s, "source-layer": "building", minzoom: 14, paint: { "fill-color": p.predio, "fill-outline-color": p.predioBorda, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0, 15, 1] } },
    { id: "aeroporto", type: "fill", source: s, "source-layer": "aeroway", minzoom: 11, filter: ["all", poligonos, ["match", ["get", "class"], ["runway", "taxiway"], true, false]], paint: { "fill-color": p.ruaMenor, "fill-opacity": 0.8 } },
    { id: "caminho", type: "line", source: s, "source-layer": "transportation", minzoom: 15, filter: ["all", linhas, ["==", ["get", "class"], "path"]], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": p.ruaMenor, "line-dasharray": [1.5, 1.5], "line-width": ["interpolate", ["exponential", 1.2], ["zoom"], 15, 1, 20, 4] } },
    { id: "rua-borda", type: "line", source: s, "source-layer": "transportation", minzoom: 13, filter: ["all", linhas, ["match", ["get", "class"], ["minor", "service"], true, false]], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": p.ruaMenorBorda, "line-width": ["interpolate", ["exponential", 1.55], ["zoom"], 13, 2.6, 20, 24] } },
    { id: "rua", type: "line", source: s, "source-layer": "transportation", minzoom: 10, filter: ["all", linhas, ["match", ["get", "class"], ["minor", "service", "track"], true, false]], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": p.ruaMenor, "line-width": ["interpolate", ["exponential", 1.55], ["zoom"], 10, 0.5, 13, 1.6, 20, 20], "line-opacity": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 12, 1] } },
    { id: "via-borda", type: "line", source: s, "source-layer": "transportation", minzoom: 11, filter: ["all", linhas, ["match", ["get", "class"], ["primary", "secondary", "tertiary", "trunk"], true, false]], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": p.viaBorda, "line-width": ["interpolate", ["exponential", 1.3], ["zoom"], 11, 3, 20, 26] } },
    { id: "via", type: "line", source: s, "source-layer": "transportation", minzoom: 7, filter: ["all", linhas, ["match", ["get", "class"], ["primary", "secondary", "tertiary", "trunk"], true, false]], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": p.via, "line-width": ["interpolate", ["exponential", 1.3], ["zoom"], 7, 0.6, 11, 1.8, 20, 22] } },
    { id: "rodovia-borda", type: "line", source: s, "source-layer": "transportation", minzoom: 9, filter: ["all", linhas, ["==", ["get", "class"], "motorway"]], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": p.rodoviaBorda, "line-width": ["interpolate", ["exponential", 1.4], ["zoom"], 9, 2.5, 20, 40] } },
    { id: "rodovia", type: "line", source: s, "source-layer": "transportation", minzoom: 5, filter: ["all", linhas, ["==", ["get", "class"], "motorway"]], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": p.rodovia, "line-width": ["interpolate", ["exponential", 1.4], ["zoom"], 5, 0.6, 9, 1.6, 20, 32] } },
    { id: "trilho", type: "line", source: s, "source-layer": "transportation", minzoom: 12, filter: ["all", linhas, ["match", ["get", "class"], ["rail", "transit"], true, false], ["!=", ["get", "brunnel"], "tunnel"]], paint: { "line-color": p.trilho, "line-dasharray": [2, 2], "line-width": ["interpolate", ["linear"], ["zoom"], 12, 1, 18, 3] } },
    { id: "limite-estado", type: "line", source: s, "source-layer": "boundary", minzoom: 3, filter: ["all", ["==", ["get", "admin_level"], 4], ["!=", ["get", "maritime"], 1]], paint: { "line-color": p.limiteEstado, "line-dasharray": [2, 2], "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.6, 10, 1.5] } },
    { id: "limite-pais", type: "line", source: s, "source-layer": "boundary", filter: ["all", ["==", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1], ["!=", ["get", "disputed"], 1]], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": p.limite, "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.8, 6, 1.4, 12, 2.5] } },
    { id: "nome-agua", type: "symbol", source: s, "source-layer": "water_name", minzoom: 3, filter: ["match", ["geometry-type"], ["MultiPoint", "Point"], true, false], layout: { "text-field": NOME_PT, "text-font": FONTE_ITALICO, "text-size": ["interpolate", ["linear"], ["zoom"], 3, 11, 10, 14], "text-max-width": 6, "text-letter-spacing": 0.1 }, paint: texto(p.textoAgua) },
    { id: "nome-rio", type: "symbol", source: s, "source-layer": "waterway", minzoom: 12, filter: linhas, layout: { "symbol-placement": "line", "symbol-spacing": 400, "text-field": NOME_LOCAL, "text-font": FONTE_ITALICO, "text-size": 12 }, paint: texto(p.textoAgua) },
    // nomes das ruas: avenidas a partir do 13; ruas a partir do 14,5; caminhos a partir do 16
    { id: "nome-via", type: "symbol", source: s, "source-layer": "transportation_name", minzoom: 13, filter: ["match", ["get", "class"], ["primary", "secondary", "tertiary", "trunk", "motorway"], true, false], layout: { "symbol-placement": "line", "symbol-spacing": 320, "text-field": NOME_LOCAL, "text-font": FONTE, "text-rotation-alignment": "map", "text-size": ["interpolate", ["linear"], ["zoom"], 13, 11.5, 17, 14] }, paint: texto(p.textoRua, 1.6) },
    { id: "nome-rua", type: "symbol", source: s, "source-layer": "transportation_name", minzoom: 14.5, filter: ["all", linhas, ["match", ["get", "class"], ["minor", "service"], true, false]], layout: { "symbol-placement": "line", "symbol-spacing": 280, "text-field": NOME_LOCAL, "text-font": FONTE, "text-rotation-alignment": "map", "text-size": ["interpolate", ["linear"], ["zoom"], 14.5, 11, 18, 13.5] }, paint: texto(p.textoRua, 1.6) },
    { id: "nome-caminho", type: "symbol", source: s, "source-layer": "transportation_name", minzoom: 16, filter: ["==", ["get", "class"], "path"], layout: { "symbol-placement": "line", "text-field": NOME_LOCAL, "text-font": FONTE_ITALICO, "text-rotation-alignment": "map", "text-size": 11 }, paint: texto(p.textoPoi) },
    { id: "numero", type: "symbol", source: s, "source-layer": "housenumber", minzoom: 17.5, layout: { "text-field": ["get", "housenumber"], "text-font": FONTE, "text-size": 10.5 }, paint: texto(p.textoPoi) },
    // pontos de interesse discretos: estações (trem, metrô) a partir do 13; os demais, só de perto e só o nome
    { id: "estacao", type: "symbol", source: s, "source-layer": "poi", minzoom: 13, filter: ["==", ["get", "class"], "rail"], layout: { "text-field": NOME_LOCAL, "text-font": FONTE_ITALICO, "text-size": ["interpolate", ["linear"], ["zoom"], 13, 10.5, 17, 12.5], "text-max-width": 8, "text-anchor": "top", "text-optional": true }, paint: texto(p.textoEstacao) },
    { id: "poi", type: "symbol", source: s, "source-layer": "poi", minzoom: 16, filter: ["all", ["!=", ["get", "class"], "rail"], ["<=", ["get", "rank"], 20]], layout: { "text-field": NOME_LOCAL, "text-font": FONTE_ITALICO, "text-size": 11, "text-max-width": 8 }, paint: texto(p.textoPoi) },
    { id: "nome-bairro", type: "symbol", source: s, "source-layer": "place", minzoom: 11, filter: ["match", ["get", "class"], ["suburb", "quarter", "neighbourhood"], true, false], layout: { ...DESVIA, "text-field": NOME_PT, "text-font": FONTE, "text-size": ["interpolate", ["linear"], ["zoom"], 11, 10, 15, 12.5], "text-transform": "uppercase", "text-letter-spacing": 0.12, "text-max-width": 7 }, paint: texto(p.textoBairro, 1.4) },
    { id: "nome-vila", type: "symbol", source: s, "source-layer": "place", minzoom: 10, filter: ["match", ["get", "class"], ["village", "hamlet"], true, false], layout: { ...DESVIA, "text-field": NOME_PT, "text-font": FONTE, "text-size": ["interpolate", ["linear"], ["zoom"], 10, 10.5, 14, 13], "text-max-width": 8 }, paint: texto(p.textoCidade) },
    { id: "nome-cidade", type: "symbol", source: s, "source-layer": "place", minzoom: 5, filter: ["all", ["==", ["get", "class"], "town"]], layout: { ...DESVIA, "text-field": NOME_PT, "text-font": FONTE, "text-size": ["interpolate", ["linear"], ["zoom"], 5, 10.5, 12, 15], "text-max-width": 8 }, paint: texto(p.textoCidade, 1.5) },
    { id: "nome-cidade-grande", type: "symbol", source: s, "source-layer": "place", minzoom: 3, filter: ["all", ["==", ["get", "class"], "city"], ["!=", ["get", "capital"], 2]], layout: { ...DESVIA, "text-field": NOME_PT, "text-font": FONTE, "text-size": ["interpolate", ["linear"], ["zoom"], 3, 11, 8, 14, 12, 18], "text-max-width": 8 }, paint: texto(p.textoCidade, 1.6) },
    { id: "nome-estado", type: "symbol", source: s, "source-layer": "place", minzoom: 4, maxzoom: 8, filter: ["==", ["get", "class"], "state"], layout: { "text-field": NOME_PT, "text-font": FONTE, "text-size": ["interpolate", ["linear"], ["zoom"], 4, 9.5, 7, 12], "text-transform": "uppercase", "text-letter-spacing": 0.18, "text-max-width": 8 }, paint: texto(p.textoEstado) },
    { id: "nome-capital", type: "symbol", source: s, "source-layer": "place", minzoom: 3, filter: ["all", ["==", ["get", "class"], "city"], ["==", ["get", "capital"], 2]], layout: { ...DESVIA, "text-field": NOME_PT, "text-font": FONTE_NEGRITO, "text-size": ["interpolate", ["linear"], ["zoom"], 3, 12, 8, 15, 12, 20], "text-max-width": 8 }, paint: texto(p.textoCidade, 1.6) },
    { id: "nome-pais", type: "symbol", source: s, "source-layer": "place", maxzoom: 7, filter: ["==", ["get", "class"], "country"], layout: { "text-field": NOME_PT, "text-font": FONTE_NEGRITO, "text-size": ["interpolate", ["linear"], ["zoom"], 1, 10, 5, 15], "text-max-width": 7, "text-transform": "uppercase", "text-letter-spacing": 0.15 }, paint: texto(p.textoPais) },
  ];
}

// ---------------------------------------------------------------------------
// Imóveis
// ---------------------------------------------------------------------------

/** Ids das camadas clicáveis dos imóveis. */
export const CAMADAS = {
  agrupamento: "lu-agrupamento",
  ponto: "lu-ponto",
  preco: "lu-preco",
  cidade: "lu-cidade",
  incerteza: "lu-incerteza",
  /** "N imóveis no bairro" (de perto, quando o círculo já sumiu, é por ele que se abre o cartão) */
  bairro: "lu-bairro-n",
} as const;

/** Fontes de dados dos imóveis (GeoJSON) e do destaque (o imóvel sob o mouse na lista ou no mapa). */
export const FONTES = { imoveis: "imoveis", destaque: "destaque" } as const;

/** Até este zoom os lugares se agrupam; do 14 em diante, cada lugar aparece sozinho (as ruas já estão à vista). */
export const ZOOM_MAX_AGRUPAMENTO = 13;
/** Raio do agrupamento (px): com as bolhas de até 28 px de raio, quase não se encostam (com 50, no celular, sim). */
export const RAIO_AGRUPAMENTO = 60;
/** Os preços aparecem nos pontos a partir deste zoom. */
export const ZOOM_PRECOS = 14;

function camadasImoveis(tema: TemaMapa): LayerSpecification[] {
  const c = CORES_DESAGIO[tema];
  const fundo = porFaixa(c.fundo);
  const halo = BASE[tema].halo;
  const textoCidade = tema === "escuro" ? "#e2bf6c" : "#7a5c1c";
  const incerteza: CircleLayerSpecification = {
    id: CAMADAS.incerteza,
    type: "circle",
    source: FONTES.imoveis,
    // o zoom no filtro vale por ladrilho (zoom inteiro): de perto, os círculos grandes nem entram no desenho
    filter: [
      "all",
      solto([2]),
      ["any", ["==", ["coalesce", ["get", "fx"], 0], 1], ["<=", ["*", ["get", "r0"], ["^", 2, ["zoom"]]], RAIO_MAX_INCERTEZA]],
    ],
    paint: {
      "circle-radius": raioEmMetros(7),
      "circle-color": fundo,
      // de perto o círculo cobre muito: fica mais transparente para as ruas aparecerem por baixo, e some antes de passar da tela
      "circle-opacity": opacidadeIncerteza(tema === "escuro" ? 0.2 : 0.24, 0.06),
      "circle-stroke-color": fundo,
      "circle-stroke-width": 1.5,
      "circle-stroke-opacity": opacidadeIncerteza(0.85, 0.4),
      "circle-pitch-alignment": "map",
    },
  };
  const agrupamento: CircleLayerSpecification = {
    id: CAMADAS.agrupamento,
    type: "circle",
    source: FONTES.imoveis,
    filter: agrupado,
    paint: {
      "circle-color": fundo,
      "circle-radius": porQuantidade(RAIO_BOLHA_AGRUPAMENTO, (r) => r),
      "circle-stroke-color": c.borda,
      "circle-stroke-width": BORDA_BOLHA,
      "circle-stroke-opacity": tema === "escuro" ? 0.9 : 1,
    },
  };
  // a contagem sempre aparece; a imagem transparente do tamanho da bolha tira os nomes do fundo de baixo dela
  const bloqueio = (degraus: readonly number[]) =>
    ({
      "icon-image": IMAGEM_BLOQUEIO,
      "icon-size": tamanhoBloqueio(degraus),
      "icon-allow-overlap": true,
      "icon-ignore-placement": false,
      "icon-padding": 1,
      "text-allow-overlap": true,
      "text-ignore-placement": false,
    }) as const;
  const agrupamentoN: SymbolLayerSpecification = {
    id: "lu-agrupamento-n",
    type: "symbol",
    source: FONTES.imoveis,
    filter: agrupado,
    layout: {
      ...bloqueio(RAIO_BOLHA_AGRUPAMENTO),
      "text-field": CONTAGEM,
      "text-font": FONTE_NEGRITO,
      "text-size": ["step", ["get", "n"], 12, 1000, 12, 5000, 13],
    },
    paint: { "text-color": porFaixa(c.texto) },
  };
  const cidade: CircleLayerSpecification = {
    id: CAMADAS.cidade,
    type: "circle",
    source: FONTES.imoveis,
    filter: solto([3]),
    paint: {
      "circle-color": c.cidadeFundo,
      "circle-opacity": 0.94,
      "circle-radius": porQuantidade(RAIO_BOLHA_CIDADE, (r) => r),
      "circle-stroke-color": fundo,
      "circle-stroke-width": BORDA_BOLHA,
    },
  };
  const cidadeN: SymbolLayerSpecification = {
    id: "lu-cidade-n",
    type: "symbol",
    source: FONTES.imoveis,
    filter: solto([3]),
    layout: { ...bloqueio(RAIO_BOLHA_CIDADE), "text-field": CONTAGEM, "text-font": FONTE_NEGRITO, "text-size": 11.5 },
    paint: { "text-color": textoCidade },
  };
  const cidadeRotulo: SymbolLayerSpecification = {
    id: "lu-cidade-rotulo",
    type: "symbol",
    source: FONTES.imoveis,
    minzoom: 9,
    filter: solto([3]),
    layout: {
      "text-field": "sem endereço exato",
      "text-font": FONTE_ITALICO,
      "text-size": 11,
      "text-anchor": "top",
      "text-offset": [0, 1.7],
      "text-optional": true,
    },
    paint: { "text-color": BASE[tema].textoBairro, "text-halo-color": halo, "text-halo-width": 1.4 },
  };
  // no centro do círculo do bairro: quantos imóveis ele tem (de perto, com "no bairro", para o número não parecer um ponto)
  const bairroN: SymbolLayerSpecification = {
    id: CAMADAS.bairro,
    type: "symbol",
    source: FONTES.imoveis,
    filter: solto([2]),
    layout: {
      "text-field": [
        "step",
        ["zoom"],
        ["case", [">", ["get", "n"], 1], CONTAGEM, ""],
        12,
        ["concat", CONTAGEM, ["case", [">", ["get", "n"], 1], " imóveis no bairro", " imóvel no bairro"]],
      ],
      "text-font": ["step", ["zoom"], ["literal", FONTE_NEGRITO], 12, ["literal", FONTE_ITALICO]],
      "text-size": ["step", ["zoom"], 11.5, 12, 12],
      "text-allow-overlap": ["step", ["zoom"], true, 12, false],
      "text-optional": true,
    },
    paint: { "text-color": tema === "escuro" ? "#eaf0ff" : "#0f1830", "text-halo-color": halo, "text-halo-width": 1.6 },
  };
  const ponto: CircleLayerSpecification = {
    id: CAMADAS.ponto,
    type: "circle",
    source: FONTES.imoveis,
    filter: solto([0, 1]),
    paint: {
      "circle-color": fundo,
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, ["case", [">", ["get", "n"], 1], 6.5, 5], 16, ["case", [">", ["get", "n"], 1], 10, 8]],
      "circle-stroke-color": c.borda,
      "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 8, 1.5, 16, 2.5],
    },
  };
  const preco: SymbolLayerSpecification = {
    id: CAMADAS.preco,
    type: "symbol",
    source: FONTES.imoveis,
    minzoom: ZOOM_PRECOS,
    filter: solto([0, 1]),
    layout: {
      "icon-image": PILULA,
      "icon-text-fit": "both",
      "icon-text-fit-padding": [3, 8, 3, 8],
      "text-field": ["get", "rot"],
      "text-font": FONTE_NEGRITO,
      "text-size": 12,
      // o de maior deságio ganha a disputa por espaço (os outros ficam só como ponto)
      "symbol-sort-key": ["-", 0, ["case", ["==", ["get", "nd"], 0], -1000, ["/", ["get", "sd"], ["get", "nd"]]]],
      "symbol-z-order": "source",
    },
    // o balão flutua sobre o ponto (que continua à vista embaixo, como a ponta de um alfinete)
    paint: { "text-color": porFaixa(c.texto), "text-translate": [0, -17], "icon-translate": [0, -17] },
  };
  // o lugar aberto no mapa: a área de incerteza dele (rua ou bairro), só dele (desenhar a de todos encheria a tela)
  const destaqueArea: CircleLayerSpecification = {
    id: "lu-destaque-area",
    type: "circle",
    source: FONTES.destaque,
    filter: [">", ["get", "r0"], 0],
    paint: {
      "circle-radius": raioEmMetros(0),
      "circle-color": c.destaque,
      "circle-opacity": 0.08,
      "circle-stroke-color": c.destaque,
      "circle-stroke-width": 1.5,
      "circle-stroke-opacity": 0.55,
      "circle-pitch-alignment": "map",
    },
  };
  // o anel do imóvel sob o mouse na lista (ou do lugar aberto no mapa)
  const destaque: CircleLayerSpecification = {
    id: "lu-destaque",
    type: "circle",
    source: FONTES.destaque,
    filter: ["!=", ["get", "nv"], 2],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 13, 16, 17],
      "circle-color": "rgba(0,0,0,0)",
      "circle-stroke-color": c.destaque,
      "circle-stroke-width": 3,
    },
  };
  return [incerteza, destaqueArea, agrupamento, agrupamentoN, cidade, cidadeN, cidadeRotulo, bairroN, ponto, preco, destaque];
}

const VAZIO: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/** O estilo inteiro (base + imóveis), com as fontes de dados dos imóveis vazias (o mapa as enche com setData). */
export function estiloMapa(tema: TemaMapa): StyleSpecification {
  return {
    version: 8,
    name: `Luneta (${tema})`,
    glyphs: OPENFREEMAP.glyphs,
    sources: {
      openmaptiles: { type: "vector", url: OPENFREEMAP.tilejson, attribution: ATRIBUICAO },
      [FONTES.imoveis]: {
        type: "geojson",
        data: VAZIO,
        cluster: true,
        clusterRadius: RAIO_AGRUPAMENTO,
        clusterMaxZoom: ZOOM_MAX_AGRUPAMENTO,
        clusterProperties: {
          n: ["+", ["get", "n"]],
          sd: ["+", ["get", "sd"]],
          nd: ["+", ["get", "nd"]],
        },
        // a borda de cada ladrilho não corta os círculos de incerteza grandes
        buffer: 128,
        tolerance: 0.5,
      },
      [FONTES.destaque]: { type: "geojson", data: VAZIO },
    },
    layers: [...camadasBase(BASE[tema]), ...camadasImoveis(tema)],
  };
}

/** Propriedades de cada lugar no GeoJSON dos imóveis (nomes curtos: são ~10 mil). */
export interface PropsLugar {
  /** índice do lugar */
  i: number;
  /** imóveis no lugar */
  n: number;
  /** nível da precisão (0 número, 1 rua, 2 bairro, 3 cidade) */
  nv: number;
  /** soma e quantidade dos deságios conhecidos */
  sd: number;
  nd: number;
  /** raio da incerteza em px no zoom 0 */
  r0: number;
  /** texto do balão de preço */
  rot: string;
  /** 1 = imóvel sozinho (página do imóvel): o círculo de incerteza não some de perto */
  fx?: number;
}

export { raioPixelZ0 };

/** Cor de fundo da página atrás do mapa (o que aparece antes dos ladrilhos chegarem, e sem eles). */
export const FUNDO_MAPA: Record<TemaMapa, string> = { escuro: BASE.escuro.terra, claro: BASE.claro.terra };

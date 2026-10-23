import { test } from "node:test";
import assert from "node:assert/strict";
import { validateStyleMin } from "@maplibre/maplibre-gl-style-spec";
import { ATRIBUICAO, CAMADAS, CORES_DESAGIO, estiloMapa, FONTES, ROTULOS_DESAGIO, type TemaMapa } from "./estilo";

const TEMAS: TemaMapa[] = ["claro", "escuro"];

test("estilo: válido pela especificação do MapLibre, nos dois temas", () => {
  for (const tema of TEMAS) {
    const erros = validateStyleMin(estiloMapa(tema) as never);
    assert.deepEqual(erros.map((e) => e.message), [], tema);
  }
});

test("estilo: OpenFreeMap (ladrilhos e fontes) com a atribuição; nenhum ícone de sprite a baixar", () => {
  const e = estiloMapa("claro");
  const omt = e.sources.openmaptiles as { url: string; attribution: string };
  assert.equal(omt.url, "https://tiles.openfreemap.org/planet");
  assert.match(e.glyphs!, /^https:\/\/tiles\.openfreemap\.org\/fonts\//);
  assert.equal(omt.attribution, ATRIBUICAO);
  assert.match(ATRIBUICAO, /© OpenMapTiles/);
  assert.match(ATRIBUICAO, /© colaboradores do OpenStreetMap/);
  assert.equal(e.sprite, undefined);
  // as únicas imagens são os balões de preço que o mapa gera (lu-pilula-*)
  const json = JSON.stringify(e.layers);
  assert.ok(!/"icon-image":"(?!lu-)/.test(json));
});

test("estilo: os dois temas têm as mesmas camadas e fontes (a troca de tema só muda cores, sem recarregar ladrilhos)", () => {
  const claro = estiloMapa("claro");
  const escuro = estiloMapa("escuro");
  assert.deepEqual(claro.layers.map((l) => l.id), escuro.layers.map((l) => l.id));
  assert.deepEqual(JSON.stringify(claro.sources), JSON.stringify(escuro.sources));
  assert.notDeepEqual(JSON.stringify(claro.layers), JSON.stringify(escuro.layers));
});

test("estilo: nomes de rua a partir do zoom 13-14,5, bairros e cidades antes; nomes em português nos lugares", () => {
  const camadas = estiloMapa("escuro").layers;
  const zoom = (id: string) => camadas.find((l) => l.id === id)!.minzoom ?? 0;
  assert.ok(zoom("nome-rua") >= 14 && zoom("nome-rua") <= 15);
  assert.ok(zoom("nome-via") >= 12 && zoom("nome-via") <= 14);
  assert.ok(zoom("nome-bairro") < zoom("nome-rua"));
  assert.ok(zoom("nome-cidade-grande") < zoom("nome-bairro"));
  assert.match(JSON.stringify(camadas.find((l) => l.id === "nome-cidade-grande")), /name:pt/);
});

test("estilo: camadas dos imóveis por cima da base, na fonte agrupada; aproximados nunca como ponto exato", () => {
  const e = estiloMapa("claro");
  const ids = e.layers.map((l) => l.id);
  const primeira = ids.findIndex((id) => id.startsWith("lu-"));
  assert.ok(ids.slice(primeira).every((id) => id.startsWith("lu-")), "nada da base por cima dos imóveis");
  for (const id of Object.values(CAMADAS)) assert.ok(ids.includes(id), id);
  const fonte = e.sources[FONTES.imoveis] as { cluster: boolean; clusterProperties: Record<string, unknown> };
  assert.equal(fonte.cluster, true);
  assert.deepEqual(Object.keys(fonte.clusterProperties).sort(), ["n", "nd", "sd"]);
  // o ponto (alfinete) e o preço só nos níveis 0 e 1 (número e rua); bairro é círculo, cidade é o marcador da sede
  const filtro = (id: string) => JSON.stringify((e.layers.find((l) => l.id === id) as { filter: unknown }).filter);
  assert.match(filtro(CAMADAS.ponto), /\[0,1\]/);
  assert.match(filtro(CAMADAS.preco), /\[0,1\]/);
  assert.match(filtro(CAMADAS.incerteza), /\[2\]/);
  assert.match(filtro(CAMADAS.cidade), /\[3\]/);
});

test("legenda: uma cor por faixa de deságio, nos dois temas", () => {
  for (const tema of TEMAS) {
    assert.equal(CORES_DESAGIO[tema].fundo.length, ROTULOS_DESAGIO.length);
    assert.equal(CORES_DESAGIO[tema].texto.length, ROTULOS_DESAGIO.length);
  }
});

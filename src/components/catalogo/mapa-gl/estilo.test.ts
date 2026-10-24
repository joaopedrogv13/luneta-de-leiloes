import { test } from "node:test";
import assert from "node:assert/strict";
import { createPropertyExpression, featureFilter, latest, validateStyleMin } from "@maplibre/maplibre-gl-style-spec";
import type { LayerSpecification } from "maplibre-gl";
import {
  ATRIBUICAO,
  CAMADAS,
  CORES_DESAGIO,
  estiloMapa,
  FONTES,
  IMAGEM_BLOQUEIO,
  RAIO_MAX_INCERTEZA,
  raioPixelZ0,
  ROTULOS_DESAGIO,
  TAMANHO_BLOQUEIO,
  type TemaMapa,
} from "./estilo";

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

/** Avalia uma propriedade de pintura ou de layout de uma camada no zoom e no ponto dados (como o MapLibre faz). */
function avaliar(camada: LayerSpecification, grupo: "paint" | "layout", nome: string, zoom: number, props: Record<string, unknown>) {
  const especificacao = (latest as unknown as Record<string, Record<string, unknown>>)[`${grupo}_${camada.type}`]![nome];
  const valor = (camada as unknown as Record<string, Record<string, unknown>>)[grupo]![nome];
  const r = createPropertyExpression(valor as never, `layers.${camada.id}.${grupo}.${nome}`, especificacao as never);
  assert.equal(r.result, "success", JSON.stringify(r.value));
  return (r.value as { evaluate: (g: unknown, f: unknown) => number }).evaluate({ zoom }, { type: 1, properties: props });
}

test("incerteza: o círculo do bairro some de perto, antes de passar do raio máximo na tela; na página do imóvel, fica", () => {
  const camada = estiloMapa("escuro").layers.find((l) => l.id === CAMADAS.incerteza)!;
  const filtro = featureFilter((camada as { filter?: unknown }).filter as never, `layers.${camada.id}.filter`);
  const r0 = raioPixelZ0(800, -22.9); // bairro com 800 m de raio, no Rio
  const lugar = { nv: 2, n: 3, r0, sd: 0, nd: 0 };
  const zoomDoRaio = (px: number) => Math.log2(px / r0);
  const entra = (z: number, p: Record<string, unknown>) => filtro.filter({ zoom: z } as never, { type: 1, properties: p } as never);
  const opacidade = (z: number, p: Record<string, unknown>) => avaliar(camada, "paint", "circle-opacity", z, p);
  // de longe: aparece inteiro
  const zPerto = zoomDoRaio(100);
  assert.ok(entra(Math.floor(zPerto), lugar));
  assert.ok(opacidade(Math.floor(zPerto), lugar) > 0.05);
  // o filtro e a pintura valem por zoom inteiro (o do ladrilho; entre dois inteiros a placa de vídeo interpola): em
  // cada inteiro, passou do máximo → fora do desenho e, onde um ladrilho de baixo ainda o traz, opacidade zero (some
  // aos poucos, sem "pulo"); até o início do sumiço, inteiro
  for (let z = 8; z <= 20; z++) {
    const raio = r0 * 2 ** z;
    assert.equal(entra(z, lugar), raio <= RAIO_MAX_INCERTEZA, `filtro no zoom ${z} (raio ${raio.toFixed(0)} px)`);
    if (raio >= RAIO_MAX_INCERTEZA) assert.equal(opacidade(z, lugar), 0, `zoom ${z}`);
    if (raio <= 140 && z <= 16) assert.ok(opacidade(z, lugar) >= 0.06, `zoom ${z}`);
  }
  assert.ok(!entra(Math.ceil(zoomDoRaio(RAIO_MAX_INCERTEZA + 1)), lugar));
  // a página do imóvel (fx): o círculo fica em qualquer zoom
  assert.ok(entra(18, { ...lugar, fx: 1 }));
  assert.ok(opacidade(18, { ...lugar, fx: 1 }) > 0.03);
  // e o rótulo "N imóveis no bairro" responde ao clique (é por ele que se abre o cartão de perto)
  assert.equal(CAMADAS.bairro, "lu-bairro-n");
});

test("bolhas: a área que tira os nomes do fundo de baixo tem o tamanho da bolha (raio + borda), em todas as contagens", () => {
  const e = estiloMapa("claro");
  for (const [bolha, numero] of [
    [CAMADAS.agrupamento, "lu-agrupamento-n"],
    [CAMADAS.cidade, "lu-cidade-n"],
  ] as const) {
    const circulo = e.layers.find((l) => l.id === bolha)!;
    const texto = e.layers.find((l) => l.id === numero)!;
    for (const n of [1, 9, 10, 49, 120, 999, 4200, 12000]) {
      const raio = avaliar(circulo, "paint", "circle-radius", 5, { n, sd: 0, nd: 0 });
      const lado = avaliar(texto, "layout", "icon-size", 5, { n }) * TAMANHO_BLOQUEIO;
      assert.ok(Math.abs(lado - 2 * (raio + 2.5)) < 1e-9, `${bolha} n=${n}`);
    }
    assert.equal((texto as { layout: Record<string, unknown> }).layout["icon-image"], IMAGEM_BLOQUEIO);
    assert.equal((texto as { layout: Record<string, unknown> }).layout["icon-ignore-placement"], false);
  }
  // o ponto isolado também ocupa o lugar dele (R5P-09): a imagem do tamanho do ponto com a borda, nos dois zooms
  const ponto = e.layers.find((l) => l.id === CAMADAS.ponto)!;
  const bloqueioPonto = e.layers.find((l) => l.id === "lu-ponto-bloqueio")!;
  assert.ok(e.layers.indexOf(bloqueioPonto) > e.layers.indexOf(ponto), "logo acima do ponto");
  for (const z of [8, 12, 16]) {
    for (const n of [1, 3]) {
      const raio = avaliar(ponto, "paint", "circle-radius", z, { n });
      const borda = avaliar(ponto, "paint", "circle-stroke-width", z, { n });
      const lado = avaliar(bloqueioPonto, "layout", "icon-size", z, { n }) * TAMANHO_BLOQUEIO;
      assert.ok(Math.abs(lado - 2 * (raio + borda)) < 1e-9, `ponto z=${z} n=${n}: ${lado} × ${2 * (raio + borda)}`);
    }
  }
  assert.equal((bloqueioPonto as { layout: Record<string, unknown> }).layout["icon-allow-overlap"], true);
  assert.equal((bloqueioPonto as { layout: Record<string, unknown> }).layout["icon-ignore-placement"], false);
  // os nomes de cidade do fundo desviam (em vez de sumir embaixo da bolha)
  const capital = e.layers.find((l) => l.id === "nome-capital") as { layout: Record<string, unknown> };
  assert.deepEqual(capital.layout["text-variable-anchor"], ["center", "top", "bottom", "right", "left"]);
});

test("legenda: uma cor por faixa de deságio, nos dois temas", () => {
  for (const tema of TEMAS) {
    assert.equal(CORES_DESAGIO[tema].fundo.length, ROTULOS_DESAGIO.length);
    assert.equal(CORES_DESAGIO[tema].texto.length, ROTULOS_DESAGIO.length);
  }
});

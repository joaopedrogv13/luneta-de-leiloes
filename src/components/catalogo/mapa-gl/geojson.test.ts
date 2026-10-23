import { test } from "node:test";
import assert from "node:assert/strict";
import { RAIO_PADRAO, raioPixelZ0, type LugarMapa, type PontosLidos } from "../../../lib/catalogo/pontos";
import {
  CAIXA_BRASIL,
  caixaDaTela,
  caixaDosLugares,
  featureDoImovel,
  geojsonDosLugares,
  mesmaArea,
  metros,
  rotuloLugar,
  textoPrecisao,
  zoomDoImovel,
} from "./geojson";

const lugar = (s: Partial<LugarMapa>): LugarMapa => ({
  i: 0, lat: -23.5, lon: -46.6, nivel: 0, raio: 30, n: 1, nome: null, inicio: 0, lanceMin: 180000, desagioSoma: 40, desagioN: 1, ...s,
});

test("precisão → incerteza: número e rua viram ponto (a rua com raio); bairro, círculo com o raio; cidade, sem raio", () => {
  const d = {
    conjunto: "v",
    total: 4,
    semPonto: 0,
    lugares: [
      lugar({ i: 0, nivel: 0, raio: 10 }),
      lugar({ i: 1, nivel: 1, raio: 240, lat: -22.9 }),
      lugar({ i: 2, nivel: 2, raio: 1300, nome: "Mooca, São Paulo/SP", n: 3, lanceMin: 90000, desagioSoma: 90, desagioN: 2 }),
      lugar({ i: 3, nivel: 3, raio: 0, nome: "Itajubá/MG", n: 2 }),
    ],
  } as unknown as PontosLidos;
  const g = geojsonDosLugares(d);
  assert.equal(g.features.length, 4);
  const p = g.features.map((f) => f.properties);
  assert.deepEqual(p.map((x) => x.nv), [0, 1, 2, 3]);
  assert.ok(Math.abs(p[1]!.r0 - raioPixelZ0(240, -22.9)) < 1e-12, "o raio em pixels no zoom 0 usa a latitude do lugar");
  assert.ok(p[2]!.r0 > p[1]!.r0);
  assert.equal(p[3]!.r0, 0, "na cidade não há círculo: o marcador é o da sede");
  assert.equal(p[2]!.rot, "3 imóveis");
  assert.equal(p[0]!.rot, "R$ 180 mil");
  assert.deepEqual(g.features[0]!.geometry.coordinates, [-46.6, -23.5], "GeoJSON é [lon, lat]");
  assert.equal(g.features[2]!.id, 2);
  // o texto da precisão nunca promete o endereço no aproximado
  assert.match(textoPrecisao(d.lugares[1]!), /aproximada pela rua \(até 240 m/);
  assert.match(textoPrecisao(d.lugares[2]!), /só o bairro.*1,3 km/);
  assert.match(textoPrecisao(d.lugares[3]!), /Sem endereço exato.*centro de Itajubá\/MG/);
  assert.match(textoPrecisao(lugar({ nivel: 0, n: 2 })), /Mesmo endereço/);
});

test("imóvel sozinho (página do imóvel): mesmas propriedades; raio padrão sem o desvio; zoom pela precisão", () => {
  const f = featureDoImovel({ lat: -22.82, lon: -43.03, nivel: 2, raio: null, lance: 250000, desagio: 35 });
  assert.equal(f.properties.nv, 2);
  assert.ok(Math.abs(f.properties.r0 - raioPixelZ0(RAIO_PADRAO[2], -22.82)) < 1e-12);
  assert.equal(f.properties.sd, 35);
  assert.equal(f.properties.nd, 1);
  assert.equal(featureDoImovel({ lat: 0, lon: 0, nivel: 0, raio: 12, lance: 1, desagio: null }).properties.nd, 0);
  assert.equal(featureDoImovel({ lat: 0, lon: 0, nivel: 3, raio: 500, lance: 1, desagio: null }).properties.r0, 0);
  assert.equal(zoomDoImovel(0, 10, -22.8, 300), 16.5);
  assert.equal(zoomDoImovel(1, 200, -22.8, 300), 15.5);
  assert.equal(zoomDoImovel(3, null, -22.8, 300), 12);
  // bairro: o círculo inteiro na altura (raio = 30% da altura)
  const z = zoomDoImovel(2, 800, -22.8, 300);
  assert.ok(Math.abs(raioPixelZ0(800, -22.8) * 2 ** z - 90) < 1e-6, String(z));
  assert.ok(zoomDoImovel(2, 50_000, -22.8, 300) >= 11);
});

test("enquadramento: percentis 2 a 98 (um imóvel perdido não afasta a câmera); poucos lugares, todos; nenhum, o Brasil", () => {
  assert.deepEqual(caixaDosLugares([]), CAIXA_BRASIL);
  const sp = Array.from({ length: 200 }, (_, k) => ({ lat: -23.5 - (k % 10) * 0.01, lon: -46.6 - Math.floor(k / 10) * 0.01, n: 1 }));
  const perdido = { lat: 3.8, lon: -32.4, n: 1 }; // Fernando de Noronha por erro
  const c = caixaDosLugares([...sp, perdido]);
  assert.ok(c[3] < -23, `norte ${c[3]}`);
  assert.ok(c[2] < -46, `leste ${c[2]}`);
  const poucos = caixaDosLugares([{ lat: -10, lon: -50, n: 1 }, perdido]);
  assert.equal(poucos[3], 3.8);
  // um ponto só: uma caixa pequena em volta (a câmera não vai ao zoom máximo)
  const um = caixaDosLugares([{ lat: -10, lon: -50, n: 1 }]);
  assert.ok(um[2] - um[0] >= 0.01 && um[3] - um[1] >= 0.01);
});

test("área da tela: 5 casas, dentro do globo; mesma área ignora tremores de menos de 2%", () => {
  assert.deepEqual(caixaDaTela(-46.123456789, -23.6, -46.1, -23.5), [-46.12346, -23.6, -46.1, -23.5]);
  assert.deepEqual(caixaDaTela(-200, -95, 200, 95), [-180, -85, 180, 85]);
  const a: [number, number, number, number] = [-46.8, -23.7, -46.4, -23.4];
  assert.ok(mesmaArea(a, [-46.801, -23.7, -46.4, -23.401]));
  assert.ok(!mesmaArea(a, [-46.7, -23.7, -46.3, -23.4]));
  assert.ok(mesmaArea(undefined, null) === false && mesmaArea(null, null));
});

test("rótulos curtos", () => {
  assert.equal(rotuloLugar({ n: 1, lanceMin: 1_250_000 }), "R$ 1,2 mi");
  assert.equal(rotuloLugar({ n: 4, lanceMin: 10 }), "4 imóveis");
  assert.equal(metros(240), "240 m");
  assert.equal(metros(1300), "1,3 km");
});

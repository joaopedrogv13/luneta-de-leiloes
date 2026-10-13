import { test } from "node:test";
import assert from "node:assert/strict";
import { distanciaKm } from "./coordenadas.ts";
import { geocodificar } from "./geocodificar.ts";

test("sem coordenada na fonte (Caixa): sede do município, precisão \"cidade\"", () => {
  const r = geocodificar({ uf: "AC", cidade: "CRUZEIRO DO SUL" });
  assert.equal(r.codigo_ibge, "1200203");
  assert.equal(r.origem, "municipio");
  assert.equal(r.precisao_geo, "cidade");
  assert.equal(r.metodo_municipio, "nome");
  assert.ok(r.lat !== null && r.lon !== null && distanciaKm(r.lat, r.lon, -7.63, -72.67) < 10);
  assert.equal(r.alerta, null);
  const df = geocodificar({ uf: "DF", cidade: "SAMAMBAIA" });
  assert.deepEqual([df.codigo_ibge, df.metodo_municipio, df.precisao_geo], ["5300108", "df", "cidade"]);
});

test("coordenada da fonte (Street View da Leilões Judiciais): mantida e conferida", () => {
  // Coordenadas reais de 3 lotes da amostra (iframe_streetview, 11/10/2026).
  const casos: Array<[string, number, number, string]> = [
    ["São Paulo", -23.5393683713536, -46.7175251255593, "3550308"],
    ["São Caetano do Sul", -23.61834262496013, -46.5705281079532, "3548807"],
    ["Presidente Prudente", -22.13920862524251, -51.39259208954989, "3541406"],
  ];
  for (const [cidade, lat, lon, codigo] of casos) {
    const r = geocodificar({ uf: "SP", cidade, lat, lon, precisao_geo: "rua" });
    assert.equal(r.origem, "fonte", cidade);
    assert.equal(r.precisao_geo, "rua", "a precisão declarada pelo conector vale");
    assert.equal(r.codigo_ibge, codigo, cidade);
    assert.equal(r.lat, Math.round(lat * 1e6) / 1e6, "6 casas decimais (~10 cm)");
    assert.equal(r.alerta, null);
  }
  const semPrecisao = geocodificar({ uf: "SP", cidade: "São Paulo", lat: -23.55, lon: -46.63 });
  assert.equal(semPrecisao.precisao_geo, "exata", "coordenada da fonte sem precisão declarada: exata");
});

test("coordenada da fonte com problema", () => {
  const invertida = geocodificar({ uf: "SP", cidade: "São Paulo", lat: -46.7175, lon: -23.5393 });
  assert.deepEqual([invertida.lat, invertida.lon, invertida.origem], [-23.5393, -46.7175, "fonte"]);
  assert.match(invertida.alerta ?? "", /invertidas/);

  const longe = geocodificar({ uf: "SP", cidade: "São Paulo", lat: -3.1, lon: -60.0 }); // Manaus
  assert.equal(longe.origem, "municipio");
  assert.equal(longe.precisao_geo, "cidade");
  assert.equal(longe.codigo_ibge, "3550308");
  assert.match(longe.alerta ?? "", /longe de São Paulo/);

  const zero = geocodificar({ uf: "RJ", cidade: "Niterói", lat: 0, lon: 0, precisao_geo: "exata" });
  assert.equal(zero.origem, "municipio", "0,0 é descartado");

  // Altamira/PA vai a 750 km da sede: um ponto a 500 km ainda é do município.
  const altamira = geocodificar({ uf: "PA", cidade: "Altamira", lat: -7.6, lon: -54.5 });
  assert.equal(altamira.origem, "fonte");
});

test("cidade não reconhecida", () => {
  const sem = geocodificar({ uf: "CE", cidade: "QUEIMADAS" });
  assert.deepEqual([sem.lat, sem.lon, sem.precisao_geo, sem.codigo_ibge, sem.origem], [null, null, null, null, "nenhuma"]);
  assert.match(sem.alerta ?? "", /cidade não reconhecida: "QUEIMADAS"\/CE/);
  const comFonte = geocodificar({ uf: "CE", cidade: "QUEIMADAS", lat: -5.2, lon: -39.3 });
  assert.equal(comFonte.origem, "fonte", "coordenada da fonte vale mesmo sem município (sem conferência)");
  assert.match(comFonte.alerta ?? "", /sem conferência/);
  const fora = geocodificar({ uf: "CE", cidade: "QUEIMADAS", lat: 40.7, lon: -74.0 });
  assert.equal(fora.origem, "nenhuma");
  assert.match(fora.alerta ?? "", /fora do Brasil/);
});

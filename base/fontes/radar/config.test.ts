import { test } from "node:test";
import assert from "node:assert/strict";
import { diaCompacto, diasDaJanela, janelaDoAmbiente, listaDoAmbiente, robotsLigado, somarDias, termosDoAmbiente, validarJanela } from "./config.ts";

const AGORA = new Date("2026-10-12T15:00:00Z");

test("janela padrão: ontem e hoje em Brasília; LUNETA_RADAR_DIAS alarga", () => {
  assert.deepEqual(janelaDoAmbiente(AGORA, {}), { desde: "2026-10-11", ate: "2026-10-12" });
  // 02h UTC ainda é dia 11 em Brasília.
  assert.deepEqual(janelaDoAmbiente(new Date("2026-10-12T02:00:00Z"), {}), { desde: "2026-10-10", ate: "2026-10-11" });
  assert.deepEqual(janelaDoAmbiente(AGORA, { LUNETA_RADAR_DIAS: "7" }), { desde: "2026-10-05", ate: "2026-10-12" });
  assert.deepEqual(janelaDoAmbiente(AGORA, { LUNETA_RADAR_DIAS: "0" }), { desde: "2026-10-12", ate: "2026-10-12" });
});

test("janela explícita e validação", () => {
  assert.deepEqual(janelaDoAmbiente(AGORA, { LUNETA_RADAR_DESDE: "2026-10-01", LUNETA_RADAR_ATE: "2026-10-08" }), { desde: "2026-10-01", ate: "2026-10-08" });
  assert.deepEqual(janelaDoAmbiente(AGORA, { LUNETA_RADAR_ATE: "2026-03-01" }), { desde: "2026-02-28", ate: "2026-03-01" });
  assert.throws(() => janelaDoAmbiente(AGORA, { LUNETA_RADAR_DESDE: "01/10/2026" }), /Início da janela inválido/);
  assert.throws(() => janelaDoAmbiente(AGORA, { LUNETA_RADAR_ATE: "2026-02-30" }), /Fim da janela inválido/);
  assert.throws(() => janelaDoAmbiente(AGORA, { LUNETA_RADAR_DESDE: "2026-10-09", LUNETA_RADAR_ATE: "2026-10-08" }), /invertida/);
  assert.throws(() => janelaDoAmbiente(AGORA, { LUNETA_RADAR_DIAS: "-1" }), /LUNETA_RADAR_DIAS/);
  assert.throws(() => validarJanela({ desde: "2025-01-01", ate: "2026-01-01" }), /366 dias passa do limite de 365/);
  assert.throws(() => janelaDoAmbiente(AGORA, { LUNETA_RADAR_DIAS: "10" }, 5), /limite de 5/);
});

test("dias, datas compactas e listas do ambiente", () => {
  assert.deepEqual(diasDaJanela({ desde: "2026-12-30", ate: "2027-01-02" }), ["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
  assert.equal(somarDias("2026-02-28", 1), "2026-03-01");
  assert.equal(somarDias("2028-02-28", 1), "2028-02-29");
  assert.equal(diaCompacto("2026-10-08"), "20261008");
  assert.deepEqual(listaDoAmbiente(" TJSP, TJRJ;TRT2  TRT15 "), ["TJSP", "TJRJ", "TRT2", "TRT15"]);
  assert.deepEqual(listaDoAmbiente(undefined), []);
  assert.deepEqual(termosDoAmbiente("leilão, hasta pública ; praça única"), ["leilão", "hasta pública", "praça única"]);
});

test("robots.txt nas APIs do radar: desligado por padrão, ligado com LUNETA_RADAR_ROBOTS", () => {
  assert.equal(robotsLigado({}), false);
  assert.equal(robotsLigado({ LUNETA_RADAR_ROBOTS: "0" }), false);
  assert.equal(robotsLigado({ LUNETA_RADAR_ROBOTS: "1" }), true);
  assert.equal(robotsLigado({ LUNETA_RADAR_ROBOTS: " sim " }), true);
});

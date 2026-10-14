import { test } from "node:test";
import assert from "node:assert/strict";
import { quandoPraca } from "./datas";

// 14/10/2026 às 12:00 em Brasília
const AGORA = Date.parse("2026-10-14T15:00:00Z");

test("praça deste ano: só dia e mês; sem hora de referência (servidor), nunca diz que passou", () => {
  assert.deepEqual(quandoPraca("2026-10-23T16:00:00.000Z", AGORA), { texto: "23 out", passou: false });
  assert.deepEqual(quandoPraca("2026-09-17T16:05:50.000Z", null), { texto: "17 set", passou: false });
});

test("praça que já passou ganha o aviso", () => {
  assert.deepEqual(quandoPraca("2026-09-17T16:05:50.000Z", AGORA), { texto: "17 set", passou: true });
  // mesma data, hora já passada em Brasília
  assert.equal(quandoPraca("2026-10-14T13:00:00Z", AGORA).passou, true);
  assert.equal(quandoPraca("2026-10-14T18:00:00Z", AGORA).passou, false);
});

test("data sem hora vale até o fim do dia em Brasília", () => {
  assert.equal(quandoPraca("2026-10-14", AGORA).passou, false);
  assert.equal(quandoPraca("2026-10-13", AGORA).passou, true);
});

test("outro ano: o ano aparece (senão 3 fev de 2027 pareceria daqui a 4 meses ou já passado)", () => {
  assert.deepEqual(quandoPraca("2027-02-03T13:00:00.000Z", AGORA), { texto: "3 fev 2027", passou: false });
  assert.deepEqual(quandoPraca("2025-12-01", AGORA), { texto: "1 dez 2025", passou: true });
  // virada do ano em Brasília: 01/01/2027 01:00 UTC ainda é 31/12/2026 em Brasília
  assert.equal(quandoPraca("2027-01-01T01:00:00Z", AGORA).texto, "31 dez");
});

test("data inválida não quebra", () => {
  assert.deepEqual(quandoPraca("não é data", AGORA), { texto: "data não informada", passou: false });
});

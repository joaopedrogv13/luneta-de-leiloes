import { test } from "node:test";
import assert from "node:assert/strict";
import { cursorDepois, formatarNumero, interpretar, mascarar } from "./mascara";

test("máscara pt-BR: milhar com ponto, decimal com vírgula", () => {
  assert.equal(mascarar("1234567"), "1.234.567");
  assert.equal(mascarar("R$ 150.000"), "150.000");
  assert.equal(mascarar("0012"), "12");
  assert.equal(mascarar("12,5"), "12");
  assert.equal(mascarar("12,5", 1), "12,5");
  assert.equal(mascarar("11.5", 1), "11,5");
  assert.equal(mascarar("2.", 1), "2,"); // digitando "2.5": o ponto vira vírgula na hora
  assert.equal(mascarar("2,5", 1), "2,5");
  assert.equal(mascarar("11.55", 2), "11,55");
  assert.equal(mascarar("1.200", 1), "1.200");
  assert.equal(mascarar("12,345", 2), "12,34");
  assert.equal(mascarar(",5", 1), "0,5");
  assert.equal(mascarar("abc"), "");
  // área com decimais (campo de 2 casas): "62,4" e "62.4" valem 62,4; "1.200" segue mil e duzentos
  assert.equal(mascarar("62,4", 2), "62,4");
  assert.equal(mascarar("62.4", 2), "62,4");
  assert.equal(mascarar("1.200", 2), "1.200");
  assert.equal(formatarNumero(62.4, 2), "62,4");
});

test("interpretar e formatar", () => {
  assert.equal(interpretar("1.234.567"), 1_234_567);
  assert.equal(interpretar("11,5"), 11.5);
  assert.equal(interpretar("12,"), 12);
  assert.equal(interpretar(""), null);
  assert.equal(interpretar(","), null);
  assert.equal(formatarNumero(1234.5, 1), "1.234,5");
  assert.equal(formatarNumero(0.07 * 100, 2), "7");
  assert.equal(formatarNumero(150000), "150.000");
});

test("cursor fica depois do mesmo dígito", () => {
  // digitou "5" no fim de "1.234" → "12.345": cursor no fim
  assert.equal(cursorDepois("1.2345", 6, "12.345"), 6);
  // digitou "9" logo depois do "1" em "1.234" → "19.234": cursor depois do 9
  assert.equal(cursorDepois("19.234", 2, "19.234"), 2);
  // apagou o "2" de "12.345" → "1.345" (bruto "1.345" vindo de "1|.345")
  assert.equal(cursorDepois("1.345", 1, "1.345"), 1);
  // "11.5" vira "11,5": cursor no fim
  assert.equal(cursorDepois("11.5", 4, "11,5", 1), 4);
  assert.equal(cursorDepois("2.", 2, "2,", 1), 2);
});

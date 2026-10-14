import assert from "node:assert/strict";
import { test } from "node:test";
import { faixaDaPagina, paginasVisiveis } from "./paginas";

test("poucas páginas: todas, sem reticências", () => {
  assert.deepEqual(paginasVisiveis(1, 1), [1]);
  assert.deepEqual(paginasVisiveis(3, 7), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(paginasVisiveis(1, 0), [1], "sem resultados: uma página");
});

test("muitas páginas: primeira, última, vizinhas e reticências, sempre 7 posições", () => {
  assert.deepEqual(paginasVisiveis(1, 52), [1, 2, 3, 4, 5, "…", 52]);
  assert.deepEqual(paginasVisiveis(4, 52), [1, 2, 3, 4, 5, "…", 52]);
  assert.deepEqual(paginasVisiveis(5, 52), [1, "…", 4, 5, 6, "…", 52]);
  assert.deepEqual(paginasVisiveis(26, 52), [1, "…", 25, 26, 27, "…", 52]);
  assert.deepEqual(paginasVisiveis(49, 52), [1, "…", 48, 49, 50, 51, 52]);
  assert.deepEqual(paginasVisiveis(52, 52), [1, "…", 48, 49, 50, 51, 52]);
  for (let p = 1; p <= 52; p++) assert.equal(paginasVisiveis(p, 52).length, 7, `página ${p}`);
});

test("nunca um buraco de uma página só (\"1 … 3\")", () => {
  for (const total of [8, 9, 10, 30]) {
    for (let p = 1; p <= total; p++) {
      const itens = paginasVisiveis(p, total);
      itens.forEach((x, i) => {
        if (x !== "…") return;
        const antes = itens[i - 1] as number;
        const depois = itens[i + 1] as number;
        assert.ok(depois - antes > 2, `total ${total}, página ${p}: ${itens.join(" ")}`);
      });
      assert.ok(itens.includes(p), `a atual aparece: ${p} de ${total}`);
    }
  }
});

test("celular: sem vizinhas, 5 posições", () => {
  assert.deepEqual(paginasVisiveis(1, 52, 0), [1, 2, 3, "…", 52]);
  assert.deepEqual(paginasVisiveis(10, 52, 0), [1, "…", 10, "…", 52]);
  assert.deepEqual(paginasVisiveis(51, 52, 0), [1, "…", 50, 51, 52]);
});

test("página fora do intervalo é ajustada", () => {
  assert.deepEqual(paginasVisiveis(99, 10), [1, "…", 6, 7, 8, 9, 10]);
  assert.deepEqual(paginasVisiveis(-3, 10), [1, 2, 3, 4, 5, "…", 10]);
});

test("faixa da página", () => {
  assert.deepEqual(faixaDaPagina(1, 24, 1234), { de: 1, ate: 24 });
  assert.deepEqual(faixaDaPagina(2, 24, 1234), { de: 25, ate: 48 });
  assert.deepEqual(faixaDaPagina(52, 24, 1234), { de: 1225, ate: 1234 });
  assert.deepEqual(faixaDaPagina(1, 24, 0), { de: 0, ate: 0 });
});

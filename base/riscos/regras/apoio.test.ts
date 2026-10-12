import { test } from "node:test";
import assert from "node:assert/strict";
import { criarTextoAnalise } from "../evidencia.ts";
import { achados, clausulas, negado, ressalvado, ressalvadoDepois } from "./apoio.ts";

test("cláusulas: corta em ';', itens '1)'/'a)' e fim de frase, mas não em abreviações", () => {
  const t = criarTextoAnalise(
    "descricao",
    "OBSERVAÇÕES: 1) Há indisponibilidade. 2) Há outras penhoras; nos termos do art. 130 do CTN. Consta na Av. 9 hipoteca. Proc. 1000818 em curso. Fim da frase. Outra frase a) item.",
  );
  const partes = clausulas(t).map((c) => t.original.slice(c.inicio, c.fim));
  assert.deepEqual(partes, [
    "OBSERVAÇÕES:",
    "1) Há indisponibilidade.",
    "2) Há outras penhoras;",
    "nos termos do art. 130 do CTN.",
    "Consta na Av. 9 hipoteca.",
    "Proc. 1000818 em curso.",
    "Fim da frase.",
    "Outra frase",
    "a) item.",
  ]);
  // Índices batem com o normalizado.
  for (const c of clausulas(t)) assert.equal(c.n, t.normalizado.slice(c.inicio, c.fim));
});

test("ressalva e negação olham só o trecho antes do achado, na mesma cláusula", () => {
  const t = criarTextoAnalise("edital", "Eventuais débitos condominiais serão sub-rogados. Há débitos condominiais. Não há débitos condominiais.");
  const [a1, a2, a3] = achados(clausulas(t), /debitos condominiais/);
  assert.ok(a1 && a2 && a3);
  assert.equal(ressalvado(a1), true);
  assert.equal(ressalvado(a2), false);
  assert.equal(negado(a2), false);
  assert.equal(negado(a3), true);
  const f = criarTextoAnalise("edital", "Correrão por conta do arrematante foro e laudêmio, quando for o caso, e registros.");
  const [l] = achados(clausulas(f), /laudemio/);
  assert.ok(l);
  assert.equal(ressalvado(l), false);
  assert.equal(ressalvadoDepois(l), true);
});

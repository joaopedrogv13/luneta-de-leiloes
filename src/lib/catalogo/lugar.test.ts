/**
 * A normalização de rua e bairro do site é a mesma do .py que gera as chaves do ITBI: os dois lados leem os
 * mesmos casos (base/fontes/itbi/casos-normalizacao.json). O .py também é rodado aqui quando há python3.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chaveBairro, normalizarBairro, normalizarRua, ruaDoEndereco } from "./lugar";

const PASTA_ITBI = join(process.cwd(), "base", "fontes", "itbi");
const casos = JSON.parse(readFileSync(join(PASTA_ITBI, "casos-normalizacao.json"), "utf8")) as { rua: [string, string][]; bairro: [string, string][] };

test("normalizarRua: mesmos resultados do normalizar.py em todos os casos", () => {
  assert.ok(casos.rua.length >= 30);
  for (const [entrada, esperado] of casos.rua) assert.equal(normalizarRua(entrada), esperado, JSON.stringify(entrada));
});

test("normalizarBairro: mesmos resultados do normalizar.py em todos os casos", () => {
  assert.ok(casos.bairro.length >= 20);
  for (const [entrada, esperado] of casos.bairro) assert.equal(normalizarBairro(entrada), esperado, JSON.stringify(entrada));
});

test("o .py confere os mesmos casos (pula sem python3)", (t) => {
  const r = spawnSync("python3", ["-I", join(PASTA_ITBI, "testar_normalizacao.py")], { encoding: "utf8" });
  if (r.error) return t.skip("python3 indisponível");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /(\d+) de \1 casos iguais/);
});

test("ruaDoEndereco: o trecho antes da vírgula, e null quando não identifica a rua", () => {
  assert.equal(ruaDoEndereco("Rua do Purus, N. S/N, Quarteirão 272, Lote 10"), "do purus");
  assert.equal(ruaDoEndereco("Rua Expedicionario Benoni Falcao Gouveia, N. 338, Lt 28, Qd 08 casa"), "expedicionario benoni falcao gouveia");
  assert.equal(ruaDoEndereco("Rua das Flores, Jardim América"), "das flores", "o bairro depois da vírgula não entra");
  assert.equal(ruaDoEndereco("Av. Jesus de Nazaré (Antiga R. Projetada), N. 20B, Qd 10 Lt 46B"), "jesus de nazare");
  assert.equal(ruaDoEndereco("Quadra 114, N. Sn, Lt 02A Rua 45"), null);
  assert.equal(ruaDoEndereco("Rua X, N. 10"), null, "uma letra não identifica a rua");
  assert.equal(ruaDoEndereco("Rua 2 de Julho, N. 924"), null);
  assert.equal(ruaDoEndereco(null), null);
  assert.equal(ruaDoEndereco(""), null);
});

test("chaveBairro e nomes que lembram propriedades de objeto", () => {
  assert.equal(chaveBairro("Jd. Paulista"), "jardim paulista");
  assert.equal(chaveBairro("  "), null);
  assert.equal(chaveBairro(null), null);
  assert.equal(normalizarRua("Rua Constructor ToString"), "constructor tostring");
  assert.equal(normalizarBairro("constructor"), "constructor");
});

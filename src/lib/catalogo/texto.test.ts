import { test } from "node:test";
import assert from "node:assert/strict";
import { casaBusca, interpretarBusca, linkGoogleMaps, palavras, quartosTexto } from "./texto";

test("palavras: minúsculas, sem acento, separadas por pontuação", () => {
  assert.deepEqual(palavras("São Paulo/SP — Água Verde, nº 18"), ["sao", "paulo", "sp", "agua", "verde", "n", "18"]);
});

test("interpretarBusca: estado pelo nome (inteiro ou com a última palavra pela metade), sigla e termos", () => {
  assert.deepEqual(interpretarBusca("Minas Gerais"), [{ tipo: "estado", uf: "MG", palavras: ["minas", "gerais"], parcial: false }]);
  assert.deepEqual(interpretarBusca("minas ge"), [{ tipo: "estado", uf: "MG", palavras: ["minas", "ge"], parcial: true }]);
  assert.deepEqual(interpretarBusca("minas"), [{ tipo: "estado", uf: "MG", palavras: ["minas"], parcial: false }]);
  assert.deepEqual(interpretarBusca("mato grosso do sul"), [{ tipo: "estado", uf: "MS", palavras: ["mato", "grosso", "do", "sul"], parcial: false }], "o mais longo primeiro");
  assert.deepEqual(interpretarBusca("rio de janeiro"), [{ tipo: "estado", uf: "RJ", palavras: ["rio", "de", "janeiro"], parcial: false }]);
  assert.deepEqual(interpretarBusca("casa BA"), [{ tipo: "termo", termo: "casa" }, { tipo: "uf", uf: "BA" }]);
  assert.deepEqual(interpretarBusca("apartamento em copacabana"), [{ tipo: "termo", termo: "apartamento" }, { tipo: "termo", termo: "copacabana" }]);
  assert.deepEqual(interpretarBusca("pará"), [{ tipo: "estado", uf: "PA", palavras: ["para"], parcial: false }]);
  assert.deepEqual(interpretarBusca("casa para reforma"), [{ tipo: "termo", termo: "casa" }, { tipo: "termo", termo: "reforma" }]);
  assert.deepEqual(interpretarBusca("casa no pará"), [{ tipo: "termo", termo: "casa" }, { tipo: "estado", uf: "PA", palavras: ["para"], parcial: false }]);
  assert.deepEqual(interpretarBusca(" , "), []);
});

test("casaBusca: a mesma regra sem índice (estado casa com a UF ou com as palavras no texto)", () => {
  const c = interpretarBusca("minas gerais");
  assert.ok(casaBusca(c, "MG", "Apartamento 2 quartos Centro Uberlândia"));
  assert.ok(casaBusca(c, "RJ", "Apartamento Minas Gerais Rio de Janeiro"), "bairro Minas Gerais");
  assert.ok(!casaBusca(c, "RJ", "Apartamento Copacabana"));
  assert.ok(!casaBusca(interpretarBusca("ba"), "PR", "Casa Curitiba"), "sigla só compara com a UF");
  assert.ok(casaBusca(interpretarBusca("cur"), "PR", "Casa Curitiba"));
  assert.ok(!casaBusca(interpretarBusca("itiba"), "PR", "Casa Curitiba"));
  assert.ok(casaBusca([], "PR", "x"));
});

test("linkGoogleMaps: endereço, bairro, cidade - UF, sem repetir a cidade", () => {
  const url = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  assert.equal(linkGoogleMaps({ endereco: "Rua Austin, N. 227", bairro: "Novo Mundo", cidade: "Uberlândia", uf: "MG" }), url("Rua Austin, N. 227, Novo Mundo, Uberlândia - MG"));
  assert.equal(linkGoogleMaps({ endereco: "Rua A, 493, Vila Industrial, Presidente Prudente/SP", bairro: null, cidade: "Presidente Prudente", uf: "SP" }), url("Rua A, 493, Vila Industrial, Presidente Prudente/SP"));
  assert.equal(linkGoogleMaps({ endereco: null, bairro: "Água Verde", cidade: "Curitiba", uf: "PR" }), url("Água Verde, Curitiba - PR"));
  assert.equal(linkGoogleMaps({ endereco: "Rua B, 10, Centro", bairro: "Centro", cidade: "X", uf: "MG" }), url("Rua B, 10, Centro, X - MG"), "bairro já no endereço");
});

test("quartosTexto", () => {
  assert.equal(quartosTexto(1), "1 quarto");
  assert.equal(quartosTexto(3), "3 quartos");
});

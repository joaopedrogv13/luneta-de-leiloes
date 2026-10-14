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
  assert.deepEqual(interpretarBusca("casa BA"), [{ tipo: "imovel", imovel: "casa" }, { tipo: "uf", uf: "BA" }]);
  assert.deepEqual(interpretarBusca("apartamento em copacabana"), [{ tipo: "imovel", imovel: "apartamento" }, { tipo: "termo", termo: "copacabana" }]);
  assert.deepEqual(interpretarBusca("pará"), [{ tipo: "estado", uf: "PA", palavras: ["para"], parcial: false }]);
  assert.deepEqual(interpretarBusca("casa para reforma"), [{ tipo: "imovel", imovel: "casa" }, { tipo: "termo", termo: "reforma" }]);
  assert.deepEqual(interpretarBusca("casa no pará"), [{ tipo: "imovel", imovel: "casa" }, { tipo: "estado", uf: "PA", palavras: ["para"], parcial: false }]);
  assert.deepEqual(interpretarBusca(" , "), []);
});

test("interpretarBusca: tipo e quartos escritos na busca; número sozinho é palavra inteira", () => {
  assert.deepEqual(interpretarBusca("ap 2 quartos"), [{ tipo: "imovel", imovel: "apartamento" }, { tipo: "quartos", n: 2, minimo: false }]);
  assert.deepEqual(interpretarBusca("apartamento 1 quarto"), [{ tipo: "imovel", imovel: "apartamento" }, { tipo: "quartos", n: 1, minimo: false }]);
  assert.deepEqual(interpretarBusca("casa 3 qts"), [{ tipo: "imovel", imovel: "casa" }, { tipo: "quartos", n: 3, minimo: false }]);
  assert.deepEqual(interpretarBusca("2+ dormitórios"), [{ tipo: "quartos", n: 2, minimo: true }]);
  assert.deepEqual(interpretarBusca("sobrado"), [{ tipo: "imovel", imovel: "casa" }]);
  assert.deepEqual(interpretarBusca("chácara"), [{ tipo: "imovel", imovel: "rural" }]);
  // "ap" sozinho continua sendo o Amapá
  assert.deepEqual(interpretarBusca("ap"), [{ tipo: "uf", uf: "AP" }]);
  assert.deepEqual(interpretarBusca("rua 101"), [{ tipo: "termo", termo: "rua" }, { tipo: "termo", termo: "101", exato: true }]);
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
  // tipo e quartos pelos campos do imóvel, não pelo texto
  const ap2 = interpretarBusca("ap 2 quartos");
  assert.ok(casaBusca(ap2, "SP", "Apartamento Centro", { tipo: "apartamento", quartos: 2 }));
  assert.ok(!casaBusca(ap2, "AP", "Casa 2 quartos Laranjal do Jari", { tipo: "casa", quartos: 2 }), "não é o Amapá");
  assert.ok(!casaBusca(ap2, "SP", "Apartamento 2 quartos", { tipo: "apartamento", quartos: 3 }));
  assert.ok(!casaBusca(interpretarBusca("1"), "SP", "Rua A 101"), "1 não casa com 101");
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

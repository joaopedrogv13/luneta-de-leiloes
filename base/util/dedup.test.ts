import { test } from "node:test";
import assert from "node:assert/strict";
import { chaveDedup, chaveEndereco, chaveMatricula, normalizarCartorio, normalizarEndereco, normalizarMatricula } from "./dedup.ts";

test("endereço normalizado: abreviações, sem acento, sem nº e sem CEP", () => {
  assert.equal(normalizarEndereco("RUA DO PURUS, N. S/N, QUARTEIRÃO 272, LOTE 10"), "rua purus sn qd 272 lt 10");
  assert.equal(normalizarEndereco("R. do Purus, s/nº, Qd. 272, Lt. 10"), "rua purus sn qd 272 lt 10", "mesma chave com abreviações");
  assert.equal(normalizarEndereco("AV. PAULISTA, Nº 1.000, APTO 52, BLOCO B - CEP: 01310-100"), "avenida paulista 1000 ap 52 bl b");
  assert.equal(normalizarEndereco("Av Paulista 1000 ap 52 bl B"), "avenida paulista 1000 ap 52 bl b");
  assert.equal(normalizarEndereco("Rua Frei Antônio de Guadalupe, nº 67, apto 21"), "rua frei antonio guadalupe 67 ap 21");
  assert.notEqual(normalizarEndereco("Rua A, 10, apto 21"), normalizarEndereco("Rua A, 10, apto 22"), "apartamentos diferentes");
});

test("matrícula e cartório", () => {
  assert.equal(normalizarMatricula("147.300"), "147300");
  assert.equal(normalizarMatricula("Matrícula nº 009740"), "9740");
  assert.equal(normalizarMatricula("sem número"), null);
  assert.equal(normalizarCartorio("6º Cartório de Registro de Imóveis de São Paulo"), "6");
  assert.equal(normalizarCartorio("Ofício: 01"), "1");
  assert.equal(normalizarCartorio("2º RI"), "2");
  assert.equal(normalizarCartorio("Cartório de Registro de Imóveis de Lagoa Santa"), "u");
  assert.equal(normalizarCartorio(null), "u");
});

test("chaves: matrícula vence endereço; mesma matrícula em fontes diferentes casa", () => {
  const caixa = { uf: "SP", cidade: "SÃO PAULO", matricula: "147300", cartorio: "Ofício: 06", endereco: "R FREI ANTONIO DE GUADALUPE 67 AP 21" };
  const lj = { uf: "SP", cidade: "São Paulo", matricula: "147.300", cartorio: "6º Cartório de Registro de Imóveis de São Paulo/SP", endereco: "Rua Frei Antônio de Guadalupe, nº 67, apto 21" };
  assert.equal(chaveMatricula(caixa), "mat:sp:sao-paulo:6:147300");
  assert.equal(chaveMatricula(caixa), chaveMatricula(lj));
  assert.equal(chaveDedup(lj), "mat:sp:sao-paulo:6:147300");
  assert.equal(chaveEndereco(caixa), chaveEndereco(lj));
  assert.equal(chaveDedup({ uf: "AC", cidade: "Cruzeiro do Sul", endereco: "RUA DO PURUS, N. S/N, QUARTEIRÃO 272, LOTE 10" }), "end:ac:cruzeiro-do-sul:rua purus sn qd 272 lt 10");
  assert.equal(chaveEndereco({ uf: "AC", cidade: "Rio Branco", endereco: "S/N" }), null, "endereço curto demais não vira chave");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { chaveCompacta, chaveFonetica, chaveNome, distanciaEdicao, leiturasAbreviadas, limparCidade } from "./nomes.ts";

test("chave estrita: acento, caixa, apóstrofo, hífen e D'OESTE", () => {
  assert.equal(chaveNome("São José dos Campos"), "sao jose dos campos");
  assert.equal(chaveNome("SAO JOSE DOS CAMPOS"), "sao jose dos campos");
  assert.equal(chaveNome("S. JOSÉ DOS CAMPOS"), "sao jose dos campos", "S. → São");
  assert.equal(chaveNome("Mogi-Mirim"), chaveNome("MOGI MIRIM"));
  for (const variante of ["MIRASSOL D'OESTE", "Mirassol d'Oeste", "MIRASSOL D OESTE", "MIRASSOL DOESTE", "Mirassol do Oeste", "MIRASSOL D´OESTE"]) {
    assert.equal(chaveNome(variante), "mirassol doeste", variante);
  }
  assert.equal(chaveNome("OLHO D'AGUA DAS FLORES"), chaveNome("Olho d'Água das Flores"));
  assert.equal(chaveNome("Olho-d'Água do Borges"), "olho dagua do borges");
  assert.equal(chaveNome("N. SRA. DO SOCORRO"), "nossa senhora do socorro");
  assert.equal(chaveNome("STA. RITA DO SAPUCAÍ"), "santa rita do sapucai");
});

test("chave solta: sem partículas e sem espaços", () => {
  assert.equal(chaveCompacta("SANT' ANA DO LIVRAMENTO"), chaveCompacta("Sant'Ana do Livramento"));
  assert.equal(chaveCompacta("Barão do Monte Alto"), chaveCompacta("Barão de Monte Alto"));
  assert.equal(chaveCompacta("Muquém do São Francisco"), chaveCompacta("Muquém de São Francisco"));
  assert.equal(chaveCompacta("Couto de Magalhães"), chaveCompacta("Couto Magalhães"));
  assert.notEqual(chaveCompacta("São José do Norte"), chaveCompacta("São José do Sul"));
});

test("chave fonética: ç/ss/s/z, y/i, th/t, ge/je, letras dobradas", () => {
  assert.equal(chaveFonetica("Açu"), chaveFonetica("ASSU"));
  assert.equal(chaveFonetica("Santa Izabel do Pará"), chaveFonetica("SANTA ISABEL DO PARA"));
  assert.equal(chaveFonetica("São Thomé das Letras"), chaveFonetica("São Tomé das Letras"));
  assert.equal(chaveFonetica("Moji Mirim"), chaveFonetica("Mogi Mirim"));
  assert.equal(chaveFonetica("Itapagé"), chaveFonetica("Itapajé"));
  assert.equal(chaveFonetica("Paraty"), chaveFonetica("Parati"));
  assert.equal(chaveFonetica("Gracho Cardoso"), chaveFonetica("Graccho Cardoso"));
  assert.equal(chaveFonetica("Presidente Castello Branco"), chaveFonetica("Presidente Castelo Branco"));
  assert.equal(chaveFonetica("Dona Euzébia"), chaveFonetica("Dona Eusébia"));
  assert.notEqual(chaveFonetica("Itapiranga"), chaveFonetica("Itupiranga"));
  // "h" mudo no começo da palavra e, no fim da palavra, "aes"/"ais" e "eia"/"ea".
  assert.equal(chaveFonetica("Herval d'Oeste"), chaveFonetica("ERVAL D OESTE"));
  assert.equal(chaveFonetica("Trajano de Moraes"), chaveFonetica("TRAJANO DE MORAIS"));
  assert.equal(chaveFonetica("Gouveia"), chaveFonetica("GOUVEA"));
  assert.notEqual(chaveFonetica("Areial"), chaveFonetica("Areal"), "só no fim da palavra");
  assert.notEqual(chaveFonetica("Caetés"), chaveFonetica("Caitês"), "só no fim da palavra");
});

test("distância de edição (com transposição) e corte", () => {
  assert.equal(distanciaEdicao("saocaetano", "saocaitano"), 1);
  assert.equal(distanciaEdicao("abc", "acb"), 1, "transposição conta 1");
  assert.equal(distanciaEdicao("", "abc"), 3);
  assert.equal(distanciaEdicao("abcdef", "abcdef"), 0);
  assert.equal(distanciaEdicao("aaaaaaaa", "bbbbbbbb", 2), 3, "passa do máximo: devolve máximo + 1");
});

test("limpar cidade: UF no fim e prefixos", () => {
  assert.deepEqual(limparCidade("São Paulo/SP"), { nome: "São Paulo", ufNoTexto: "SP" });
  assert.deepEqual(limparCidade("SAO PAULO - SP"), { nome: "SAO PAULO", ufNoTexto: "SP" });
  assert.deepEqual(limparCidade("Recife (PE)"), { nome: "Recife", ufNoTexto: "PE" });
  assert.deepEqual(limparCidade("Comarca de Lagoa Santa"), { nome: "Lagoa Santa", ufNoTexto: null });
  assert.deepEqual(limparCidade("Município de  Cabo de Santo Agostinho "), { nome: "Cabo de Santo Agostinho", ufNoTexto: null });
  assert.deepEqual(limparCidade("CEARA-MIRIM"), { nome: "CEARA-MIRIM", ufNoTexto: null }, "hífen no nome não é UF");
  assert.deepEqual(limparCidade("SAO PAULO (CAPITAL)"), { nome: "SAO PAULO", ufNoTexto: null });
  assert.deepEqual(limparCidade("São Paulo - Capital"), { nome: "São Paulo", ufNoTexto: null });
  assert.deepEqual(limparCidade("NITEROI RJ", "RJ"), { nome: "NITEROI", ufNoTexto: "RJ" }, "UF informada no fim, só com espaço");
  assert.deepEqual(limparCidade("NITEROI RJ"), { nome: "NITEROI RJ", ufNoTexto: null }, "sem a UF informada, não adivinha");
});

test("leituras de abreviação ambígua", () => {
  assert.deepEqual(leiturasAbreviadas(chaveNome("S J DOS CAMPOS")), ["sao jose dos campos", "sao joao dos campos"]);
  assert.deepEqual(leiturasAbreviadas(chaveNome("S. J. DEL REI")), ["sao jose del rei", "sao joao del rei"]);
  assert.deepEqual(leiturasAbreviadas(chaveNome("SAO JOSE DOS CAMPOS")), []);
});

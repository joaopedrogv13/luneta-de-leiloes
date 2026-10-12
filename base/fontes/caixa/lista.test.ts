import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decodificarLista, interpretarLista, pareceBloqueio } from "./lista.ts";

const FIXTURES = join(import.meta.dirname, "fixtures");
const BYTES_CP1252 = readFileSync(join(FIXTURES, "Lista_imoveis_30.csv"));

const CABECALHO = " N° do imóvel;UF;Cidade;Bairro;Endereço;Preço;Valor de avaliação;Desconto;Financiamento;Descrição;Modalidade de venda;Link de acesso";
const linha = (n: string, extra = ""): string =>
  ` ${n} ;AC ;RIO BRANCO ;CENTRO ;RUA A, N. 1 ;100.000,00;200.000,00;50.00;Não;Casa, 0.00 de área total, 50.00 de área privativa, 0.00 de área do terreno.;Venda Direta Online;https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnimovel=${n}${extra}`;
const csv = (...linhas: string[]): string => ["", " Lista de Imóveis da Caixa;;Data de geração:;08/10/2026;;;;;;;", CABECALHO, "", ...linhas, ""].join("\n");

test("CSV original em CP1252: decodifica acentos, lê a data de geração e as 30 linhas", () => {
  const texto = decodificarLista(BYTES_CP1252);
  assert.ok(texto.includes("Lista de Imóveis da Caixa"), "ó em CP1252 (0xF3) decodificado");
  const lista = interpretarLista(texto);
  assert.equal(lista.geradoEm, "2026-10-08");
  assert.equal(lista.registros.length, 30);
  assert.deepEqual(lista.colunasExtras, []);
  const primeira = lista.registros[0];
  assert.equal(primeira?.problema, null);
  assert.equal(primeira?.campos.numero, "10005120", "campos cortados nas bordas");
  assert.equal(primeira?.campos.endereco, "RUA DO PURUS, N. S/N, QUARTEIRÃO 272, LOTE 10");
  assert.equal(primeira?.campos.modalidade, "Venda Direta Online");
  assert.equal(primeira?.linhaArquivo, 5);
  assert.ok(lista.registros.some((r) => r.campos.modalidade === "Leilão SFI - Edital Único"));
  assert.ok(lista.registros.some((r) => r.campos.modalidade === "Licitação Aberta"));
});

test("a mesma lista em UTF-8 (cópia convertida) dá o mesmo resultado", () => {
  const utf8 = new TextEncoder().encode(decodificarLista(BYTES_CP1252));
  const a = interpretarLista(decodificarLista(BYTES_CP1252));
  const b = interpretarLista(decodificarLista(utf8));
  assert.deepEqual(b, a);
  const comBom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8]);
  assert.deepEqual(interpretarLista(decodificarLista(comBom)), a);
});

test("recusa página de desafio anti-robô, HTML, assinatura ausente e acentos corrompidos", () => {
  assert.throws(() => interpretarLista("<html><head><title>Radware Bot Manager Captcha</title></head></html>"), /anti-robô/);
  assert.throws(() => interpretarLista("<!DOCTYPE html><html><body>Erro</body></html>"), /HTML no lugar do CSV/);
  assert.throws(() => interpretarLista("Lista de Precos;;Data:;08/10/2026\n"), /assinatura/);
  assert.throws(() => interpretarLista(csv(linha("10005120")).replace("Imóveis", "ImÃ³veis")), /corrompidos/);
  assert.match(pareceBloqueio("... validate.perfdrive.com ...") ?? "", /perfdrive/);
  assert.equal(pareceBloqueio(csv(linha("1"))), null);
});

test("recusa data de geração ausente ou inválida e cabeçalho sem coluna obrigatória", () => {
  assert.throws(() => interpretarLista(csv(linha("10005120")).replace("08/10/2026", "")), /Data de geração/);
  assert.throws(() => interpretarLista(csv(linha("10005120")).replace("08/10/2026", "31/02/2026")), /Data de geração/);
  assert.throws(() => interpretarLista(csv(linha("10005120")).replace(";Preço;", ";Valor;")), /cabeçalho sem Preço/);
});

test("arquivo truncado: última linha com menos colunas ou link cortado sem quebra final", () => {
  const inteiro = csv(linha("10005120"), linha("10005121"));
  assert.equal(interpretarLista(inteiro).registros.length, 2);
  const cortadoNoMeio = inteiro.slice(0, inteiro.lastIndexOf("RUA A"));
  assert.throws(() => interpretarLista(cortadoNoMeio), /truncado/);
  const cortadoNoLink = inteiro.trimEnd().slice(0, -3);
  assert.throws(() => interpretarLista(cortadoNoLink), /truncado/);
  // Sem quebra final, mas inteiro: aceita.
  assert.equal(interpretarLista(inteiro.trimEnd()).registros.length, 2);
});

test("linha com colunas a mais no meio vira problema da linha (não derruba o arquivo)", () => {
  const lista = interpretarLista(csv(linha("10005120"), linha("10005121", ";sobra"), linha("10005122")));
  assert.equal(lista.registros.length, 3);
  assert.match(lista.registros[1]?.problema ?? "", /13 colunas/);
  assert.equal(lista.registros[2]?.problema, null);
});

test("colunas reordenadas ou novas: lê pelo nome e avisa as desconhecidas", () => {
  const cab = " UF;N° do imóvel;Cidade;Bairro;Endereço;Preço;Valor de avaliação;Desconto;Financiamento;Descrição;Modalidade de venda;Link de acesso;Nova";
  const l = " AC ;10005120 ;RIO BRANCO ;CENTRO ;RUA A ;1,00;2,00;50.00;Não;Casa.;Venda Online;https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnimovel=10005120;x";
  const lista = interpretarLista(["Lista de Imóveis da Caixa;;Data de geração:;08/10/2026", cab, l, ""].join("\n"));
  assert.equal(lista.registros[0]?.campos.numero, "10005120");
  assert.equal(lista.registros[0]?.campos.uf, "AC");
  assert.deepEqual(lista.colunasExtras, ["Nova"]);
});

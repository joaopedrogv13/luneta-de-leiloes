import { test } from "node:test";
import assert from "node:assert/strict";
import { criarZip } from "./testes.ts";
import { ErroZip, lerZip, pareceZip } from "./zip.ts";

const decodificar = (b: Uint8Array): string => new TextDecoder().decode(b);

test("lê entradas deflate e stored, com nome UTF-8, e respeita o filtro", () => {
  const zip = criarZip([
    { nome: "2026-10-09-DO3/matéria-1.xml", dados: "<xml>um</xml>".repeat(50) },
    { nome: "2026-10-09-DO3/imagem.jpg", dados: new Uint8Array([1, 2, 3]), metodo: 0 },
    { nome: "2026-10-09-DO3/matéria-2.xml", dados: "<xml>dois</xml>", metodo: 0 },
  ]);
  assert.equal(pareceZip(zip), true);
  const todas = lerZip(zip);
  assert.deepEqual(todas.map((e) => e.nome), ["2026-10-09-DO3/matéria-1.xml", "2026-10-09-DO3/imagem.jpg", "2026-10-09-DO3/matéria-2.xml"]);
  assert.equal(decodificar(todas[0]?.dados ?? new Uint8Array()), "<xml>um</xml>".repeat(50));
  const xml = lerZip(zip, (nome) => nome.endsWith(".xml"));
  assert.deepEqual(xml.map((e) => decodificar(e.dados).slice(0, 13)), ["<xml>um</xml>", "<xml>dois</xm"]);
});

test("ZIP vazio devolve lista vazia", () => {
  assert.deepEqual(lerZip(criarZip([])), []);
});

test("recusa o que não é ZIP (ex.: página de login em HTML)", () => {
  const html = new TextEncoder().encode("<!DOCTYPE html><html><body>Faça login</body></html>");
  assert.equal(pareceZip(html), false);
  assert.throws(() => lerZip(html), (e: unknown) => e instanceof ErroZip && /Não é um arquivo ZIP \(começa com "<!DOCTYPE html>/.test(e.message));
});

test("detecta CRC errado, arquivo truncado e passa dos limites", () => {
  const zip = criarZip([{ nome: "a.xml", dados: "conteudo original", metodo: 0 }]);
  const corrompido = new Uint8Array(zip);
  corrompido[30 + "a.xml".length] = "C".charCodeAt(0);
  assert.throws(() => lerZip(corrompido), /CRC-32 não confere/);

  const truncado = zip.subarray(0, zip.length - 30);
  assert.throws(() => lerZip(truncado), ErroZip);

  const grande = criarZip([{ nome: "grande.xml", dados: "x".repeat(10_000) }]);
  assert.throws(() => lerZip(grande, () => true, { maxBytesEntrada: 1000 }), /passa do limite por arquivo/);
  assert.throws(() => lerZip(grande, () => true, { maxRazao: 5 }), /razão de compressão suspeita/);
  assert.throws(() => lerZip(criarZip([{ nome: "a", dados: "1" }, { nome: "b", dados: "2" }]), () => true, { maxEntradas: 1 }), /2 entradas/);
});

test("método de compressão desconhecido gera erro claro", () => {
  const zip = criarZip([{ nome: "a.xml", dados: "abc", metodo: 0 }]);
  const alterado = new Uint8Array(zip);
  const visao = new DataView(alterado.buffer);
  // Método no diretório central (logo depois da entrada local).
  const central = 30 + "a.xml".length + 3;
  visao.setUint16(central + 10, 12, true);
  assert.throws(() => lerZip(alterado), /método de compressão 12 não suportado/);
});

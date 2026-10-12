import { test } from "node:test";
import assert from "node:assert/strict";
import { decodificar } from "./arquivo.ts";
import { inferirTipoImovel, classificarModalidade } from "./classificar.ts";
import { lerCsv, linhasComoObjetos } from "./csv.ts";
import { ehDataDaBase, hojeBrasilia, instanteDe, lerDataBR, lerDataHoraBR } from "./data.ts";
import { hashEstavel, jsonCanonico } from "./hash.ts";
import { arredondar, formatarMoedaBR, lerInteiro, lerNumeroBR } from "./numero.ts";
import { capitalizarNome, dobrarCaixaEAcento, normalizarTexto, semAcento, semHtml, slug, textoOuNulo, truncar } from "./texto.ts";
import { ehUf, normalizarUf } from "./uf.ts";

test("lerNumeroBR: formatos brasileiros e casos de borda", () => {
  assert.equal(lerNumeroBR("1.234,56"), 1234.56);
  assert.equal(lerNumeroBR("R$ 1.700.000,00"), 1700000);
  assert.equal(lerNumeroBR("50.074,26"), 50074.26);
  assert.equal(lerNumeroBR("0,01"), 0.01);
  assert.equal(lerNumeroBR("66.62"), 66.62, "ponto decimal com 2 casas (coluna Desconto da Caixa)");
  assert.equal(lerNumeroBR("600.00"), 600);
  assert.equal(lerNumeroBR("1.234"), 1234, "milhar sem decimais");
  assert.equal(lerNumeroBR("1.234.567"), 1234567);
  assert.equal(lerNumeroBR("-12,5"), -12.5);
  assert.equal(lerNumeroBR("165,555m²"), 165.555);
  assert.equal(lerNumeroBR("1.234", { decimal: "." }), 1.234);
  assert.equal(lerNumeroBR("1,5", { decimal: "," }), 1.5);
  assert.equal(lerNumeroBR(""), null);
  assert.equal(lerNumeroBR("-"), null);
  assert.equal(lerNumeroBR("não informado"), null);
  assert.equal(lerNumeroBR(null), null);
  assert.equal(lerNumeroBR(42), 42);
  assert.equal(lerNumeroBR(Number.NaN), null);
  assert.equal(lerInteiro("3 qto(s)"), 3);
  assert.equal(lerInteiro("2,5"), null);
});

test("arredondar e formatar moeda", () => {
  assert.equal(arredondar(1.005, 2), 1.01);
  assert.equal(arredondar(42.0849, 2), 42.08);
  assert.equal(formatarMoedaBR(1234.5), "R$ 1.234,50");
});

test("lerDataBR: dia em AAAA-MM-DD", () => {
  assert.equal(lerDataBR("08/10/2026"), "2026-10-08");
  assert.equal(lerDataBR("8/10/26"), "2026-10-08");
  assert.equal(lerDataBR("Data de geração: 08.10.2026"), "2026-10-08");
  assert.equal(lerDataBR("2026-10-08"), "2026-10-08");
  assert.equal(lerDataBR("17 de setembro de 2026"), "2026-09-17");
  assert.equal(lerDataBR("1º de março de 2027"), "2027-03-01");
  assert.equal(lerDataBR("31/02/2026"), null, "dia inexistente");
  assert.equal(lerDataBR("29/02/2028"), "2028-02-29", "ano bissexto");
  assert.equal(lerDataBR("sem data"), null);
});

test("lerDataHoraBR: converte horário de Brasília para UTC", () => {
  assert.equal(lerDataHoraBR("06/10/2026 10:12:00"), "2026-10-06T13:12:00.000Z");
  assert.equal(lerDataHoraBR("06/10/2026 às 10h12"), "2026-10-06T13:12:00.000Z");
  assert.equal(lerDataHoraBR("2026-09-17 13:05:50-03"), "2026-09-17T16:05:50.000Z", "formato da API Leilões Judiciais");
  assert.equal(lerDataHoraBR("2026-09-17T13:05:50Z"), "2026-09-17T13:05:50.000Z");
  assert.equal(lerDataHoraBR("06/10/2026 10:00", "-05:00"), "2026-10-06T15:00:00.000Z", "fuso do Acre");
  assert.equal(lerDataHoraBR("06/10/2026"), "2026-10-06", "sem hora fica só o dia");
  assert.equal(lerDataHoraBR("2026-09-17"), "2026-09-17");
  assert.equal(lerDataHoraBR("06/10/2026 25:00"), null);
});

test("datas da base: validação, instante e dia em Brasília", () => {
  assert.ok(ehDataDaBase("2026-10-08"));
  assert.ok(ehDataDaBase("2026-10-08T13:00:00.000Z"));
  assert.ok(ehDataDaBase("2026-10-08T10:00:00-03:00"));
  assert.ok(!ehDataDaBase("08/10/2026"));
  assert.ok(!ehDataDaBase("2026-02-30"));
  assert.ok(!ehDataDaBase("2026-10-08T13:00:00"), "data-hora sem fuso é ambígua");
  assert.equal(instanteDe("2026-10-08"), Date.parse("2026-10-09T02:59:59.000Z"), "dia sem hora vale até o fim do dia em Brasília");
  assert.equal(hojeBrasilia(new Date("2026-10-13T01:00:00Z")), "2026-10-12");
});

test("texto: HTML, entidades, acentos, slug e capitalização", () => {
  assert.equal(semHtml("<p>Im&oacute;vel&nbsp;<b>OCUPADO</b></p><p>Linha 2</p>"), "Imóvel OCUPADO\nLinha 2");
  assert.equal(semHtml("Antes<!-- Situação: Desocupado -->Depois"), "Antes Depois", "comentário HTML não vira conteúdo");
  assert.equal(semHtml("a<script>alert(1)</script>b"), "a b");
  assert.equal(semHtml("&#231;&#xE7;&amp;"), "çç&");
  assert.equal(semAcento("São João, Pará"), "Sao Joao, Para");
  assert.equal(normalizarTexto("<b>Imóvel  DESOCUPADO</b>&nbsp;"), "imovel desocupado");
  assert.equal(slug("São José dos Campos"), "sao-jose-dos-campos");
  assert.equal(capitalizarNome("CRUZEIRO DO SUL"), "Cruzeiro do Sul");
  assert.equal(capitalizarNome("SÃO JOÃO DEL-REI"), "São João Del-Rei");
  assert.equal(capitalizarNome("BRASÍLIA DF"), "Brasília DF");
  assert.equal(textoOuNulo("   "), null);
  assert.equal(textoOuNulo("  a  b "), "a b");
  assert.equal(truncar("uma frase comprida demais", 12), "uma frase…");
});

test("dobrarCaixaEAcento preserva o comprimento (índices batem com o original)", () => {
  const original = "Imóvel OCUPADO pelo executado; ação revisional em São Paulo";
  const dobrado = dobrarCaixaEAcento(original);
  assert.equal(dobrado.length, original.length);
  assert.equal(dobrado, "imovel ocupado pelo executado; acao revisional em sao paulo");
  const i = dobrado.indexOf("acao revisional");
  assert.equal(original.slice(i, i + "acao revisional".length), "ação revisional");
});

test("hash estável não depende da ordem das chaves", () => {
  assert.equal(jsonCanonico({ b: 1, a: [2, { d: 1, c: undefined }] }), '{"a":[2,{"d":1}],"b":1}');
  assert.equal(hashEstavel({ a: 1, b: 2 }), hashEstavel({ b: 2, a: 1 }));
  assert.notEqual(hashEstavel({ a: 1 }), hashEstavel({ a: 2 }));
  assert.match(hashEstavel("x"), /^[0-9a-f]{64}$/);
});

test("CSV: separador, aspas, quebras e BOM", () => {
  const texto = '﻿a;b;c\r\n1;"dois; com aspas ""x""";3\n\n4;"linha\nquebrada";6';
  const linhas = lerCsv(texto);
  assert.deepEqual(linhas, [["a", "b", "c"], ["1", 'dois; com aspas "x"', "3"], [""], ["4", "linha\nquebrada", "6"]]);
  const objetos = linhasComoObjetos([" a ", "b", "c"], linhas.slice(1));
  assert.equal(objetos.length, 2, "linha vazia é pulada");
  assert.equal(objetos[0]?.a, "1");
  assert.deepEqual(lerCsv("x,y\n1,2", { separador: "," }), [["x", "y"], ["1", "2"]]);
});

test("decodificar: UTF-8 e Windows-1252 (CSV da Caixa)", () => {
  // "Imóveis;Não" em CP1252: ó = 0xF3, ã = 0xE3
  const cp1252 = new Uint8Array([0x49, 0x6d, 0xf3, 0x76, 0x65, 0x69, 0x73, 0x3b, 0x4e, 0xe3, 0x6f]);
  assert.equal(decodificar(cp1252, "windows-1252"), "Imóveis;Não");
  assert.equal(decodificar(cp1252, "auto"), "Imóveis;Não", "bytes inválidos em UTF-8 caem para CP1252");
  const utf8 = new TextEncoder().encode("Imóveis;Não");
  assert.equal(decodificar(utf8, "auto"), "Imóveis;Não");
  // 0x80–0x9F: onde o CP1252 difere do ISO-8859-1 (o TextDecoder do Node 22 erra esses bytes).
  assert.equal(decodificar(new Uint8Array([0x80, 0x93, 0x41, 0x94, 0x96, 0x85]), "windows-1252"), "€“A”–…");
  assert.equal(decodificar(new Uint8Array([0x93, 0x41, 0x94, 0xe7]), "auto"), "“A”ç");
});

test("classificar tipo de imóvel", () => {
  assert.equal(inferirTipoImovel("Apartamento, 0.00 de área total, 50.00 de área privativa"), "apartamento");
  assert.equal(inferirTipoImovel("Casa, 0.00 de área total, 240.00 de área privativa, 3 qto(s), 3 sala(s)"), "casa");
  assert.equal(inferirTipoImovel("Casa com garagem"), "casa");
  assert.equal(inferirTipoImovel("Sobrado"), "casa");
  assert.equal(inferirTipoImovel("Terreno, 0.00 de área total"), "terreno");
  assert.equal(inferirTipoImovel("Gleba Urbana"), "terreno");
  assert.equal(inferirTipoImovel("Gleba"), "rural");
  assert.equal(inferirTipoImovel("Imóvel rural"), "rural");
  assert.equal(inferirTipoImovel("Galpão"), "comercial");
  assert.equal(inferirTipoImovel("Prédio"), "comercial");
  assert.equal(inferirTipoImovel("Vaga de garagem"), "vaga");
  assert.equal(inferirTipoImovel("Apartamento nº 21 c/ 165,555m² - Macapá/AP"), "apartamento");
  assert.equal(inferirTipoImovel("Outros, 0.00 de área total"), "outro");
  assert.equal(inferirTipoImovel(""), "outro");
});

test("classificar modalidade", () => {
  assert.deepEqual(classificarModalidade("Leilão SFI - Edital Único"), { modalidade: "leilao", judicial: false });
  assert.deepEqual(classificarModalidade("Venda Direta Online"), { modalidade: "venda_direta", judicial: null });
  assert.deepEqual(classificarModalidade("Venda Online"), { modalidade: "venda_online", judicial: null });
  assert.deepEqual(classificarModalidade("Licitação Aberta"), { modalidade: "licitacao_aberta", judicial: null });
  assert.deepEqual(classificarModalidade("711ª LEILÃO JUDICIAL UNIFICADO DO TRT DA 2ª REGIÃO"), { modalidade: "leilao", judicial: true });
  assert.deepEqual(classificarModalidade(""), { modalidade: "outro", judicial: null });
});

test("UF", () => {
  assert.equal(normalizarUf(" sp "), "SP");
  assert.equal(normalizarUf("São Paulo"), "SP");
  assert.equal(normalizarUf("Mato Grosso do Sul"), "MS");
  assert.equal(normalizarUf("XX"), null);
  assert.ok(ehUf("RJ"));
  assert.ok(!ehUf("rj"));
});

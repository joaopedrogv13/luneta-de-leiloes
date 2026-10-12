import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ErroFicha, extrairDocumentos, interpretarFicha } from "./ficha.ts";

const FIXTURES = join(import.meta.dirname, "fixtures");
const FICHA_2026 = readFileSync(join(FIXTURES, "ficha_0000010005120_2026-10-08.html"), "utf8");
const FICHA_2023 = readFileSync(join(FIXTURES, "ficha_1444410505954_2023-12.html"), "utf8");

test("ficha real de 2026 (Venda Direta Online, terreno no AC)", () => {
  const f = interpretarFicha(FICHA_2026);
  assert.equal(f.titulo, "TERRENO");
  assert.equal(f.numero_imovel, "0000010005120", "\"000001000512-0\" sem o traço, com 13 dígitos");
  assert.equal(f.tipo_imovel, "Terreno");
  assert.deepEqual(f.matriculas, ["9740"]);
  assert.equal(f.comarca, "CRUZEIRO DO SUL-AC");
  assert.equal(f.oficio, "01");
  assert.equal(f.inscricao_imobiliaria, null, "\"Não identificado\" não é inscrição");
  assert.equal(f.averbacao_leiloes_negativos, "Averbado");
  assert.equal(f.valor_avaliacao, 150000);
  assert.equal(f.valor_minimo, 50074.26);
  assert.equal(f.desconto_ficha, 66.62);
  assert.equal(f.area_terreno, 600);
  assert.equal(f.area_privativa, null);
  assert.equal(f.cep, "69980000");
  assert.equal(f.endereco, "RUA DO PURUS,N. S/N QUARTEIRÃO 272, LOTE 10, BAIRRO COHAB");
  assert.equal(f.descricao, null, "descrição \".\" é vazia");
  assert.equal(f.formas_pagamento, "Exclusivamente à vista (somente recursos próprios).");
  assert.match(f.regra_condominio ?? "", /^Sob responsabilidade do comprador, até o limite de 10%/);
  assert.doesNotMatch(f.regra_condominio ?? "", /Tributos/);
  assert.match(f.regra_tributos ?? "", /inferior a 10% do valor de avaliação/);
  assert.equal(f.aceita_financiamento, false);
  assert.equal(f.aceita_fgts, false, "somente recursos próprios");
  assert.equal(f.aceita_parcelamento, false, "exclusivamente à vista");
  assert.equal(f.aceita_consorcio, false);
  assert.deepEqual(f.pracas, []);
  assert.equal(f.data_licitacao, null);
  assert.equal(f.leiloeiro, null);
  assert.deepEqual(f.fotos, ["https://venda-imoveis.caixa.gov.br/fotos/F000001000512021.jpg"]);
  assert.equal(f.tem_galeria, true);
  assert.deepEqual(f.documentos, [
    { tipo: "matricula", titulo: "Matrícula do imóvel", url: "https://venda-imoveis.caixa.gov.br/editais/matricula/AC/0000010005120.pdf" },
  ]);
  assert.match(f.texto, /REGRAS PARA PAGAMENTO DAS DESPESAS/);
  assert.doesNotMatch(f.texto, /Corretores credenciados/);
});

test("ficha real de 2023 (Venda Online, casa em Angra dos Reis)", () => {
  const f = interpretarFicha(FICHA_2023);
  assert.equal(f.titulo, "COND ACONCHEGO DE ANGRA II");
  assert.equal(f.numero_imovel, "1444410505954");
  assert.equal(f.tipo_imovel, "Casa");
  assert.equal(f.quartos, 2);
  assert.equal(f.vagas, 1);
  assert.deepEqual(f.matriculas, ["22029"]);
  assert.equal(f.comarca, "ANGRA DOS REIS-RJ");
  assert.equal(f.oficio, "01");
  assert.equal(f.inscricao_imobiliaria, "02180820318002");
  assert.equal(f.averbacao_leiloes_negativos, "Averbado");
  assert.equal(f.valor_avaliacao, 279000);
  assert.equal(f.valor_minimo, 205846.2);
  assert.equal(f.area_privativa, 71.87);
  assert.equal(f.area_terreno, 119.99);
  assert.equal(f.cep, "23900000");
  assert.equal(f.endereco, "ALAMEDA DOS TUCANOS (ANTIGA RUA L) QD 28 LT 46 CS 03, PONTAL (CUNHAMBEBE)");
  assert.equal(f.descricao, "2 Quartos, 1 Vaga na Garagem, Varanda/sacada, Área de Serviço, 2 Wc, Sala, Cozinha.");
  assert.equal(f.formas_pagamento, null);
  assert.equal(f.aceita_financiamento, false, "\"Imóvel NÃO aceita financiamento habitacional\"");
  assert.equal(f.aceita_parcelamento, false);
  assert.equal(f.aceita_consorcio, false);
  assert.equal(f.aceita_fgts, null, "a ficha não fala de FGTS");
  assert.deepEqual(f.fotos, [
    "https://venda-imoveis.caixa.gov.br/fotos/F144441050595421.jpg",
    "https://venda-imoveis.caixa.gov.br/fotos/F144441050595422.jpg",
  ], "só as fotos publicadas; as que estão em comentário HTML ficam de fora");
  assert.deepEqual(f.documentos.map((d) => d.url), ["https://venda-imoveis.caixa.gov.br/editais/matricula/RJ/1444410505954.pdf"]);
});

test("\"Situação: Desocupado\" só existe em comentário HTML e não é lido", () => {
  for (const html of [FICHA_2023, FICHA_2026]) {
    assert.match(html, /<!--span>Situação: <strong>Desocupado/, "a fixture tem o comentário");
    const f = interpretarFicha(html);
    assert.doesNotMatch(JSON.stringify(f), /Desocupado|Situa[çc][ãa]o/);
  }
});

test("lista de documentos real (carregaListaDocumentos.asp): editais com data de publicação", () => {
  const docs = extrairDocumentos(readFileSync(join(FIXTURES, "lista_documentos_2026-10-08.html"), "utf8"));
  assert.equal(docs.length, 3);
  assert.deepEqual(docs[0], {
    tipo: "edital",
    titulo: "Edital de Publicação do Leilão SFI - Edital Único - EL00500226CPARE.PDF",
    url: "https://venda-imoveis.caixa.gov.br/editais/EL00500226CPARE.PDF",
    publicado_em: "2026-10-06T13:12:00.000Z",
  });
});

test("página de desafio, página sem o bloco do imóvel e ficha sem avaliação são recusadas", () => {
  assert.throws(() => interpretarFicha("<html><script src='https://validate.perfdrive.com/x.js'></script></html>"), (e: unknown) => e instanceof ErroFicha && /anti-robô/.test(e.message));
  assert.throws(() => interpretarFicha("<html><body><p>Imóvel não encontrado.</p></body></html>"), /bloco de dados/);
  assert.throws(() => interpretarFicha(FICHA_2026.replace(/Valor de avaliação/g, "Valor")), /Valor de avaliação/);
});

test("ficha de verdade com script do anti-robô embutido continua valendo", () => {
  const comSensor = FICHA_2026.replace("</head>", "<script src='https://cdn.perfdrive.com/aperture/aperture.js'></script></head>");
  assert.equal(interpretarFicha(comSensor).numero_imovel, "0000010005120");
});

// Os rótulos de leilão abaixo NÃO foram vistos em HTML real (vêm de parsers de terceiros).
// O trecho é sintético, montado no layout das fichas reais, só para fixar o comportamento.
test("[sintético] praças do Leilão SFI, leiloeiro, edital e FGTS permitido", () => {
  const leilao = FICHA_2026
    .replace(
      "<p style='font-size:14pt'>Valor de avaliação: R$ 150.000,00<br /><b>Valor mínimo de venda: R$ 50.074,26</b> ( desconto de 66,62%)</p>",
      "<p style='font-size:14pt'>Valor de avaliação: R$ 150.000,00<br /><b>Valor mínimo de venda 1º Leilão: R$ 160.000,00</b><br /><b>Valor mínimo de venda 2º Leilão: R$ 95.000,00</b></p>" +
        "<p><span>Edital: <strong>0050/0226-CPA/RE</strong></span> <span>Número do item: <strong>12</strong></span><br>" +
        "<span>Leiloeiro(a): <strong>Leiloeira Oficial Exemplo</strong></span><br>" +
        "<span>Data do 1º Leilão - 20/10/2026 - 10h00</span><br><span>Data do 2º Leilão - 04/11/2026 - 10h00</span></p>",
    )
    .replace("Exclusivamente à vista (somente recursos próprios).", "Recursos próprios.<br />Permite utilização de FGTS.<br />Permite financiamento - somente SBPE.");
  const f = interpretarFicha(leilao);
  assert.deepEqual(f.pracas, [
    { numero: 1, data: "2026-10-20T13:00:00.000Z", valor_minimo: 160000 },
    { numero: 2, data: "2026-11-04T13:00:00.000Z", valor_minimo: 95000 },
  ]);
  assert.equal(f.valor_minimo, null);
  assert.equal(f.leiloeiro, "Leiloeira Oficial Exemplo");
  assert.equal(f.edital, "0050/0226-CPA/RE");
  assert.equal(f.numero_item, "12");
  assert.equal(f.aceita_fgts, true);
  assert.equal(f.aceita_financiamento, true);
  assert.equal(f.aceita_parcelamento, null);
});

test("[sintético] data da Licitação Aberta", () => {
  const html = FICHA_2026.replace("<span>Comarca:", "<span>Data da Licitação Aberta - 27/10/2026 - 10h00</span><br><span>Comarca:");
  assert.equal(interpretarFicha(html).data_licitacao, "2026-10-27T13:00:00.000Z");
});

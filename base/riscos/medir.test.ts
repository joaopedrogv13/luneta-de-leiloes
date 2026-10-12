import { test } from "node:test";
import assert from "node:assert/strict";
import { FONTE_CAIXA, FONTE_LJ, formatarDistribuicao, imovelDaLinhaCaixa, imovelDoLoteLJ, lerListaCaixa, lotesDaRespostaLJ, medir } from "./medir.ts";

const AGORA = new Date("2026-10-12T12:00:00Z");

/** Três linhas reais do CSV da Caixa de 08/10/2026 (dados do imóvel, sem dado pessoal). */
const CSV_CAIXA = [
  " Lista de Imóveis da Caixa;;Data de geração:;08/10/2026;;;;;;;",
  " N° do imóvel;UF;Cidade;Bairro;Endereço;Preço;Valor de avaliação;Desconto;Financiamento;Descrição;Modalidade de venda;Link de acesso",
  "",
  " 10005120 ;AC ;CRUZEIRO DO SUL ;BAIRRO COHAB ;RUA DO PURUS, N. S/N, QUARTEIRÃO 272, LOTE 10 ;50.074,26;150.000,00;66.62;Não;Terreno, 0.00 de área total, 0.00 de área privativa, 600.00 de área do terreno.;Venda Direta Online;https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnimovel=10005120",
  " 1444420699441 ;AC ;CRUZEIRO DO SUL ;CENTRO ; AVENIDA 17 DE NOVEMBRO, N. SN, QD 27 LT 18 ;232.180,38;507.000,00;54.21;Sim;Casa, 0.00 de área total, 240.00 de área privativa, 300.00 de área do terreno,  3 qto(s), WC, 3 sala(s), cozinha.;Venda Direta Online;https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnimovel=1444420699441",
  " 1444419018304 ;AC ;RIO BRANCO ;NOVA ESPERANCA ;RUA BENZINHO, N. SN, ;643.740,15;441.000,00;0.00;Não;Terreno, 0.00 de área total, 0.00 de área privativa, 600.00 de área do terreno.;Leilão SFI - Edital Único;https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnimovel=1444419018304",
].join("\r\n");

test("medir: CSV da Caixa só pelos campos do CSV (linhas reais)", () => {
  const linhas = lerListaCaixa(CSV_CAIXA);
  assert.equal(linhas.length, 3);
  const amostras = linhas.map(imovelDaLinhaCaixa).map((imovel) => {
    assert.ok(imovel);
    return { imovel, fonte: FONTE_CAIXA };
  });
  const d = medir(amostras, { agora: AGORA });
  assert.equal(d.imoveis, 3);
  assert.deepEqual(d.erros, []);
  assert.equal(d.porTag["ocupacao-nao-informada"].sim, 3);
  assert.equal(d.porTag["aceita-financiamento"].sim, 1);
  assert.equal(d.porTag["aceita-financiamento"].nao, 2);
  assert.equal(d.porTag["direito-preferencia"].sim, 1, "Leilão SFI");
  assert.equal(d.porTag["direito-preferencia"].nao, 2, "venda direta");
  assert.equal(d.porTag["preco-acima-mercado"].sim, 1);
  assert.equal(d.porTag["preco-acima-mercado"].revisao, 1);
  assert.equal(d.porTag["praca-unica"].sim, 2);
  assert.equal(d.porTag["primeira-praca"].desconhecido, 1, "SFI sem ficha: o CSV não diz a praça");
  assert.equal(d.porTag["sem-fotos"].desconhecido, 3, "capa por padrão de URL, não verificada");
  // Nenhuma tag de texto sai "sim" a partir dos campos do CSV.
  for (const tag of ["ocupado", "desocupado", "condominio-em-atraso", "iptu-em-atraso", "divida-passa-arrematante", "acao-judicial", "penhora-outros-credores", "matricula-pendencia", "construcao-irregular", "cota-parte", "so-direitos", "sem-vistoria"] as const) {
    assert.equal(d.porTag[tag].sim, 0, tag);
  }
  assert.match(formatarDistribuicao("caixa", d), /ocupacao-nao-informada\s+3 \(100,0%\)/);
});

test("medir: resposta JSON-RPC da Leilões Judiciais (lote fictício no formato da sonda)", () => {
  const interno = {
    query: "apartamento",
    totalResults: 1,
    results: [
      {
        lote_id: 900001,
        leilao_id: 90001,
        nm_titulo_lote: "Direitos - Apartamento - 80m² - São Paulo/SP",
        nm_titulo_leilao: "2º LEILÃO JUDICIAL - VARA CÍVEL",
        nm_descricao: "<p>Direitos sobre o apartamento nº 1. OBSERVAÇÕES: 1) Há outras penhoras.</p>",
        nm_estado: "SP",
        nm_cidade: "São Paulo",
        vl_lanceinicial: "50000.00",
        vl_lanceminimo: "100000.00",
        vl_lanceinicialsegundoleilao: "50000.00",
        dt_fechamento: "2026-10-20 14:00:00-03",
        fotos: [],
        anexos: [{ nm: "EDITAL", nm_path_completo: "https://exemplo.test/edital.pdf" }],
        nu_parcelas: 30,
      },
    ],
  };
  const resposta = JSON.stringify({ jsonrpc: "2.0", id: 4, result: { content: [{ type: "text", text: JSON.stringify(interno) }] } }) + "\nHTTP 200 application/json\n";
  const lotes = lotesDaRespostaLJ(resposta);
  assert.equal(lotes.length, 1);
  const imovel = imovelDoLoteLJ(lotes[0] ?? {});
  assert.ok(imovel);
  assert.equal(imovel.praca_atual, 2);
  const d = medir([{ imovel, fonte: FONTE_LJ }], { agora: AGORA, exemplos: 5 });
  assert.equal(d.porTag["so-direitos"].sim, 1);
  assert.equal(d.porTag["penhora-outros-credores"].sim, 1);
  assert.equal(d.porTag["segunda-praca"].sim, 1);
  assert.equal(d.porTag["sem-fotos"].sim, 1);
  assert.equal(d.porTag["aceita-financiamento"].desconhecido, 1, "parcelamento não é financiamento");
  assert.equal(d.porTag["desagio-alto"].sim, 1);
  assert.ok((d.exemplos["so-direitos"] ?? [])[0]?.startsWith("900001 [titulo, alta]"));
});

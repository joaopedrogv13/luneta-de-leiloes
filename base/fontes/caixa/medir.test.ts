import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { medir, relacaoPreco } from "./medir.ts";

const CABECALHO = " N° do imóvel;UF;Cidade;Bairro;Endereço;Preço;Valor de avaliação;Desconto;Financiamento;Descrição;Modalidade de venda;Link de acesso";
const linha = (n: string, preco: string, avaliacao: string, desconto: string, modalidade = "Leilão SFI - Edital Único"): string =>
  ` ${n} ;SC ;BLUMENAU ;CENTRO ;RUA A, N. 1 ;${preco};${avaliacao};${desconto};Não;Casa, 0.00 de área total, 50.00 de área privativa, 0.00 de área do terreno.;${modalidade};` +
  `https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnimovel=${n}`;

test("relacaoPreco compara em centavos: 305.011,21 contra 305.000,00 está acima, mesmo com deságio arredondado 0", () => {
  assert.equal(relacaoPreco(305011.21, 305000), "acima");
  assert.equal(relacaoPreco(305000, 305000), "igual");
  assert.equal(relacaoPreco(304999.99, 305000), "abaixo");
});

test("medir: preço um pouco acima da avaliação conta como acima, não como igual", () => {
  const dir = mkdtempSync(join(tmpdir(), "caixa-medir-"));
  try {
    const arquivo = join(dir, "lista.csv");
    const linhas = [
      "",
      " Lista de Imóveis da Caixa;;Data de geração:;08/10/2026;;;;;;;",
      CABECALHO,
      "",
      // Caso real do CSV de 08/10/2026 (imóvel 1444417628245): deságio −0,0037%, que arredonda para 0.
      linha("1444417628245", "305.011,21", "305.000,00", "0.00"),
      linha("1444417628246", "200.000,00", "200.000,00", "0.00"),
      linha("1444417628247", "100.000,00", "200.000,00", "50.00", "Venda Direta Online"),
    ];
    writeFileSync(arquivo, `${linhas.join("\n")}\n`);
    const m = medir(arquivo);
    assert.equal(m.linhas, 3);
    assert.equal(m.desagio.preco_acima, 1);
    assert.equal(m.desagio.preco_igual, 1);
    assert.equal(m.desagio.faixas["< 0 (preço acima da avaliação)"], 1);
    assert.equal(m.desagio.faixas["0 (preço igual à avaliação)"], 1);
    assert.equal(m.desagio.faixas["50–60%"], 1);
    assert.equal(m.modalidades["Leilão SFI - Edital Único"]?.preco_acima_avaliacao, 1);
    assert.equal(m.desagio.coluna_desconto_zero_com_preco_acima, 1);
    assert.equal(m.desagio.divergencias_coluna_desconto, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

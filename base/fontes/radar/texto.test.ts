import { test } from "node:test";
import assert from "node:assert/strict";
import { analisarLeilaoImovel } from "./filtro.ts";
import { extrairDataLeilao, extrairLocal, mascararNomesConhecidos, numeroDoAviso, resumoRelevante } from "./texto.ts";

test("data do leilão: primeira data futura depois de leilão/praça, com hora de Brasília em UTC", () => {
  const edital = "1º leilão: 25/11/2026 às 14h00, pela avaliação. 2º leilão: 09/12/2026 às 14h00, por 60% da avaliação.";
  assert.equal(extrairDataLeilao(edital, "2026-10-08"), "2026-11-25T17:00:00.000Z");
  assert.equal(extrairDataLeilao("Despacho de 01/10/2026. O leilão será em 20/11/2026.", "2026-10-08"), "2026-11-20");
  assert.equal(extrairDataLeilao("realizará leilão de imóveis no dia 20/11/2026, às 10h, no Paço", "2026-10-08"), "2026-11-20T13:00:00.000Z");
  assert.equal(extrairDataLeilao("O leilão será realizado em 5 de dezembro de 2026, no auditório.", "2026-10-08"), "2026-12-05");
  assert.equal(extrairDataLeilao("1ª praça em 01/12/2026, às 11h, e 2ª praça em 15/12/2026", "2026-10-09"), "2026-12-01T14:00:00.000Z");
});

test("data do leilão: ignora datas antes da publicação e datas fora do contexto de leilão", () => {
  assert.equal(extrairDataLeilao("O leilão realizado em 10/09/2026 foi deserto.", "2026-10-08"), null);
  assert.equal(extrairDataLeilao("Leilão marcado para hoje, 08/10/2026 às 15h00.", "2026-10-08"), "2026-10-08T18:00:00.000Z");
  assert.equal(extrairDataLeilao("Publicado em 20/11/2026. Imóvel urbano.", "2026-10-08"), null);
  assert.equal(extrairDataLeilao("Leilão nº 3/2026 da Lei 9.514/97, processo 0001234-56.2026.8.26.0100.", "2026-10-08"), null);
  assert.equal(extrairDataLeilao("Leilão em 31/02/2026.", null), null, "data inexistente");
});

test("data do leilão: gatilho específico vence; edital, impugnação, entrega de propostas e processo não são data do leilão", () => {
  // Modelo do aviso do Compras.gov.br no DOU.
  const comprasnet =
    "AVISO DE LEILÃO Nº 1/2026 - UASG 170123. Objeto: Alienação de imóvel da União situado em Brasília/DF. Edital: 09/10/2026 das 08h00 às 12h00 e de 14h00 às 17h00. " +
    "Endereço: Esplanada dos Ministérios, Bloco K. Entrega das Propostas: a partir de 09/10/2026 às 08h00 no site www.gov.br/compras. Abertura das Propostas: 20/10/2026 às 09h00 no site www.gov.br/compras.";
  assert.equal(extrairDataLeilao(comprasnet, "2026-10-09"), "2026-10-20T12:00:00.000Z");
  assert.equal(extrairDataLeilao("EDITAL DE LEILÃO. O leilão do imóvel terá impugnações até 15/10/2026. 1º leilão em 30/10/2026 às 14h.", "2026-10-09"), "2026-10-30T17:00:00.000Z");
  assert.equal(extrairDataLeilao("Leilão de imóvel. Esclarecimentos até 20/10/2026. Sessão pública: 05/11/2026, às 10h.", "2026-10-09"), "2026-11-05T13:00:00.000Z");
  assert.equal(extrairDataLeilao("Leilão de imóvel. Cadastro dos interessados até 19/11/2026.", "2026-10-09"), null);
  // "Vila Exemplo, 7 de outubro de 2026" é a assinatura, mesmo perto de "leilão".
  assert.equal(extrairDataLeilao("Edital do leilão disponível na Prefeitura. Vila Exemplo, 9 de outubro de 2026.", "2026-10-09"), null);
});

test("data do leilão: sem publicação, recusa datas antes da coleta; aceita ano com 2 dígitos e hora no extenso", () => {
  const texto = "Leilão do imóvel, processo 0709098-48.2018.8.07.0007 de 01/02/2019, leilão em 12/11/2026";
  assert.equal(extrairDataLeilao(texto, null), "2026-11-12", "a data do processo não é do leilão");
  assert.equal(extrairDataLeilao("Leilão do imóvel em 01/02/2019.", null, new Date("2026-10-12T12:00:00Z")), null, "antes da coleta");
  assert.equal(extrairDataLeilao("Leilão do imóvel em 01/02/2019.", null), "2019-02-01", "sem referência nenhuma, a data fica");
  assert.equal(extrairDataLeilao("LEILÃO DE IMÓVEL em 12/11/26 às 10h", "2026-10-08"), "2026-11-12T13:00:00.000Z");
  assert.equal(extrairDataLeilao("O leilão será realizado no dia 10 de novembro de 2026, às 10 horas.", "2026-10-09"), "2026-11-10T13:00:00.000Z");
});

test("cidade e UF: comarca/município de X, X/UF e Estado de", () => {
  // Endereços públicos de imóveis em leilão (amostra real da Leilões Judiciais).
  assert.deepEqual(
    extrairLocal("Imóvel localizado na Rua José Benedetti, nº 18 e Rua Monte Alegre nº 270, São Caetano do Sul/SP."),
    { uf: "SP", cidade: "São Caetano do Sul" },
  );
  assert.deepEqual(extrairLocal("O IMÓVEL DE MATRÍCULA Nº 147.300 DO 6º CARTÓRIO DE REGISTRO DE IMÓVEIS DE SÃO PAULO/SP."), { uf: "SP", cidade: "São Paulo" });
  assert.deepEqual(extrairLocal("Juiz de Direito da Vara Cível da Comarca de Quedas do Iguaçu/PR faz saber"), { uf: "PR", cidade: "Quedas do Iguaçu" });
  assert.deepEqual(extrairLocal("VARA CÍVEL DA COMARCA DE QUEDAS DO IGUAÇU-PARANÁ, nomeando"), { uf: "PR", cidade: "Quedas do Iguaçu" });
  assert.deepEqual(extrairLocal("situado no Município de Santos/SP, matrícula"), { uf: "SP", cidade: "Santos" });
  assert.deepEqual(extrairLocal("Superintendência do Patrimônio da União no Estado de São Paulo"), { uf: "SP", cidade: null });
  assert.deepEqual(extrairLocal("Superintendência no Estado do Rio de Janeiro"), { uf: "RJ", cidade: null });
  assert.deepEqual(extrairLocal("Advogado OAB/SP 123.456, CRECI/SP 9"), { uf: null, cidade: null });
  assert.deepEqual(extrairLocal("Sem local nenhum."), { uf: null, cidade: null });
  // Sonda arquivada da Leilões Judiciais: "15ª REGIÃO DE PIRACICABA/SP" era "Região de Piracicaba".
  assert.deepEqual(extrairLocal("TRIBUNAL REGIONAL DO TRABALHO DA 15ª REGIÃO DE PIRACICABA/SP"), { uf: "SP", cidade: "Piracicaba" });
  // Nome de rua antes de "/UF" não é cidade.
  assert.deepEqual(extrairLocal("CNPJ/MF nº 00.000.000/0001-00, com sede na Av. Paulista/SP"), { uf: null, cidade: null });
  assert.deepEqual(extrairLocal("situado na Rua Bahia/SP, em Campinas/SP"), { uf: "SP", cidade: "Campinas" });
  assert.deepEqual(extrairLocal("Superintendência do Patrimônio da União em Minas Gerais"), { uf: "MG", cidade: null });
  assert.deepEqual(extrairLocal("Superintendência do Patrimônio da União no Distrito Federal"), { uf: "DF", cidade: null });
  assert.deepEqual(extrairLocal("Defeito no para-raios do prédio."), { uf: null, cidade: null }, "'para' sem acento não é o Pará");
});

test("cidade e UF: respeita as UFs permitidas (ex.: jurisdição do tribunal)", () => {
  const texto = "Bem em Campinas/SP; depósito em Niterói/RJ.";
  assert.deepEqual(extrairLocal(texto), { uf: "SP", cidade: "Campinas" });
  assert.deepEqual(extrairLocal(texto, ["RJ", "ES"]), { uf: "RJ", cidade: "Niterói" });
});

test("número do aviso", () => {
  assert.equal(numeroDoAviso("EDITAL DE LEILÃO PÚBLICO Nº 002/2026. O Município"), "nº 002/2026");
  assert.equal(numeroDoAviso("AVISO DE LEILÃO Nº 3/2026"), "nº 3/2026");
  assert.equal(numeroDoAviso("Edital de leilão eletrônico n. 15/2026"), "nº 15/2026");
  assert.equal(numeroDoAviso("EDITAL DE LEILÃO JUDICIAL E INTIMAÇÃO"), null);
});

test("resumo: começo do texto e trechos em volta do leilão e do imóvel, com limite", () => {
  const enchimento = "Considerando o disposto na legislação aplicável. ".repeat(80);
  const texto = `CABEÇALHO DO DIÁRIO. ${enchimento} EDITAL DE LEILÃO Nº 1/2026. ${enchimento} BEM: apartamento nº 12 com 70 m². ${enchimento}`;
  const analise = analisarLeilaoImovel(texto);
  assert.equal(analise.aceito, true);
  const resumo = resumoRelevante(analise);
  assert.ok(resumo.length <= 1800, `resumo com ${resumo.length} caracteres`);
  assert.ok(resumo.startsWith("CABEÇALHO DO DIÁRIO."));
  assert.match(resumo, /EDITAL DE LEILÃO Nº 1\/2026/);
  assert.match(resumo, /apartamento nº 12/);
  assert.match(resumo, / … /);
  const curto = analisarLeilaoImovel("Leilão de terreno urbano.");
  assert.equal(resumoRelevante(curto), "Leilão de terreno urbano.");
});

test("nomes rotulados pela fonte são mascarados em qualquer caixa e acento; nomes de uma palavra não", () => {
  const texto = "executado FULANO FICTÍCIO DE TAL (CPF ...). Intimem-se Fulano Fictício de Tal e a BANCO. Talesfulano FICTICIO DE TALES.";
  const saida = mascararNomesConhecidos(texto, ["FULANO FICTICIO DE TAL", "BANCO", "  "]);
  assert.equal(saida, "executado [NOME] (CPF ...). Intimem-se [NOME] e a BANCO. Talesfulano FICTICIO DE TALES.");
  assert.equal(mascararNomesConhecidos("RECLAMADO: 50.229.022 ROBSON EXEMPLO, ROBSON EXEMPLO", ["50.229.022 ROBSON EXEMPLO"]), "RECLAMADO: 50.229.022 [NOME], [NOME]");
  assert.equal(mascararNomesConhecidos("sem nomes", []), "sem nomes");
});

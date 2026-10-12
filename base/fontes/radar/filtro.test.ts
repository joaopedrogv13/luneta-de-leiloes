import { test } from "node:test";
import assert from "node:assert/strict";
import { analisarLeilaoImovel, ehAvisoSemLeilaoFuturo, ehLeilaoDeImovel } from "./filtro.ts";

// Trechos reais de lotes da API Leilões Judiciais (sonda arquivada agreg4-r.txt, 11/10/2026):
// descrição pública de imóvel em leilão, sem dados pessoais.
const LJ_TRT2 =
  "711ª LEILÃO JUDICIAL UNIFICADO DO TRT DA 2ª REGIÃO EM SÃO PAULO/SP. LOTE 096 – 12:11H) (Proc. 1000818-76.2020.5.02.0090 - 90ª VT São Paulo/SP) " +
  "O IMÓVEL DE MATRÍCULA Nº 147.300 DO 6º CARTÓRIO DE REGISTRO DE IMÓVEIS DE SÃO PAULO/SP. DESCRIÇÃO: O apartamento nº 21, localizado no 2º andar " +
  "ou 4º pavimento do Edifício Jardins de Guadalupe, com a área útil de 165,555m², a área comum de 269,861m², a área total de 435,416m² " +
  "e a participação no terreno e coisas comuns do condomínio de 12,5000%, estando-lhe vinculados 1 depósito localizado no 2º subsolo, e 3 vagas " +
  "de garagem, esta localizada nos 1º e 2º subsolos, sendo que cada caga comporta 1 veículo.";
const LJ_DIREITOS =
  "Leilão judicial. Direitos sobre o apartamento nº 161, com a área privativa de 160,780m² e a área comum de 311,966m², perfazendo a área total de " +
  "472,746m², localizado no 16º pavimento da TORRE “G-3”, contando com 03 vagas para guarda de automóveis de passeio em lugares individuais.";

// Trechos reais de editais do DJEN (amostra arquivada de 30/04/2026), com os nomes trocados por [NOME].
const DJEN_PENHORA = "EDITAL DE INTIMAÇÃO DA PENHORA SISBAJUD PRAZO: 20 DIAS A Doutora [NOME], Juíza de Direito da 3ª Vara Cível de Taguatinga";
const DJEN_CITACAO =
  "PODER JUDICIÁRIO JUSTIÇA DO TRABALHO TRIBUNAL REGIONAL DO TRABALHO DA 1ª REGIÃO 3ª VARA DO TRABALHO DE MACAÉ ATOrd 0100576-47.2026.5.01.0483 " +
  "RECLAMANTE: [NOME] RECLAMADO: [NOME] EDITAL DE CITAÇÃO PJe-JT AUDIÊNCIA UNA";
const DJEN_LEILAO_TRUNCADO =
  "EDITAL DE LEILÃO JUDICIAL E INTIMAÇÃO Leilão Exclusivamente Eletrônico (www.kronleiloes.com.br) O(A) EXMO(A) SR(A) DR(A) JUIZ(A) DE DIREITO DA (O) " +
  "VARA CÍVEL DE QUEDAS DO IGUAÇU-PARANÁ, [NOME] nomeando o leiloeiro público [NOME], JUCEPAR 653, faz ciência aos interessados e, principalmente, " +
  "aos executados/devedores que, nos autos do(s) processo(s) abaixo indicado(s...";

test("textos reais de leilão de imóvel são aceitos, mesmo citando veículo na vaga de garagem", () => {
  const a = analisarLeilaoImovel(LJ_TRT2);
  assert.equal(a.aceito, true, a.motivo);
  assert.ok(a.imovelForte.some((s) => s.rotulo === "apartamento"));
  assert.ok(a.moveis.some((s) => s.rotulo === "veículo"), "a vaga 'comporta 1 veículo' aparece como sinal de móvel");
  assert.match(a.motivo, /também cita bens móveis/);
  assert.equal(ehLeilaoDeImovel(LJ_DIREITOS), true);
});

test("textos reais do DJEN sem leilão de imóvel são descartados", () => {
  assert.match(analisarLeilaoImovel(DJEN_PENHORA).motivo, /sem menção a leilão/);
  assert.equal(ehLeilaoDeImovel(DJEN_CITACAO), false);
  const truncado = analisarLeilaoImovel(DJEN_LEILAO_TRUNCADO);
  assert.equal(truncado.aceito, false, "o texto truncado da amostra não chega a descrever o bem");
  assert.ok(truncado.leilao.length > 0);
  assert.match(truncado.motivo, /sem sinal claro de imóvel/);
  assert.equal(truncado.moveis.length, 0, "'leilão eletrônico' não é bem móvel");
});

test("leilão de bens móveis é descartado; leilão misto com imóvel é aceito", () => {
  assert.equal(ehLeilaoDeImovel("AVISO DE LEILÃO Nº 1/2026. Alienação de veículos, motocicletas e sucatas inservíveis."), false);
  assert.equal(ehLeilaoDeImovel("Leilão de equipamentos de informática e mobiliário. Lote 01: computadores. Lote 02: cadeiras."), false);
  assert.equal(ehLeilaoDeImovel("Leilão de bens imóveis e de veículos inservíveis do Estado."), true);
  assert.equal(ehLeilaoDeImovel("Leilão: Lote 01 – caminhão; Lote 02 – terreno urbano com 300 m²."), true);
});

test("falsos amigos: Fazenda Nacional, Casa Civil, sítio eletrônico, lote de leilão e praça como logradouro", () => {
  assert.equal(ehLeilaoDeImovel("Procuradoria-Geral da Fazenda Nacional. Leilão de bens penhorados: equipamentos industriais."), false);
  assert.equal(ehLeilaoDeImovel("Ministério da Fazenda. Aviso de leilão de veículos oficiais."), false);
  assert.equal(ehLeilaoDeImovel("Secretaria de Estado da Fazenda: leilão de mercadorias apreendidas."), false);
  assert.equal(ehLeilaoDeImovel("Leilão da Fazenda Santa Rita, com 120 hectares e benfeitorias."), true);
  assert.equal(ehLeilaoDeImovel("Casa Civil da Presidência. Leilão de mobiliário."), false);
  assert.equal(ehLeilaoDeImovel("Edital disponível no sítio eletrônico do leiloeiro. Leilão de sucatas."), false);
  assert.equal(ehLeilaoDeImovel("Leilão. Lote 01: veículo Gol 2015. Lote 02: motocicleta."), false);
  assert.equal(ehLeilaoDeImovel("Leilão do lote 12 da quadra 7 do Loteamento Jardim Exemplo."), true);
  assert.equal(ehLeilaoDeImovel("Audiência na sede, Praça da Sé, s/n. Fica intimado o réu sobre o imóvel penhorado."), false);
  assert.equal(ehLeilaoDeImovel("1ª praça em 01/12/2026; 2ª praça em 15/12/2026. Bem: casa térrea com 3 quartos."), true);
});

test("concessão ou locação sem venda fica de fora; com alienação, entra", () => {
  const uso = analisarLeilaoImovel("Edital de leilão para concessão de uso, a título oneroso, de área pública no terminal para lanchonete.");
  assert.equal(uso.aceito, false);
  assert.match(uso.motivo, /cessão de uso ou locação/);
  assert.equal(ehLeilaoDeImovel("Leilão para locação de imóvel comercial do Município."), false);
  assert.equal(ehLeilaoDeImovel("Leilão para alienação ou concessão de direito real de uso de imóvel urbano."), true);
});

test("sem sinal forte, dois indícios fracos bastam; com bem móvel, não", () => {
  assert.equal(ehLeilaoDeImovel("Leilão judicial. Bem: área total de 250 m², matrícula nº 1.234, com benfeitorias."), true);
  assert.equal(ehLeilaoDeImovel("Leilão judicial. Bem: área total de 250 m²."), true, "área total e metragem: dois indícios");
  assert.equal(ehLeilaoDeImovel("Leilão judicial. Bem penhorado sob matrícula nº 9."), false, "um indício só");
  assert.equal(ehLeilaoDeImovel("Leilão de equipamentos. Galpão de guarda com área total de 200 m², matrícula nº 9."), true, "galpão é sinal forte");
  assert.equal(ehLeilaoDeImovel("Leilão de equipamentos guardados em área total de 200 m² sob matrícula nº 9."), false);
});

test("modalidade de leilão garantida pela fonte (PNCP) dispensa a palavra leilão", () => {
  const texto = "Alienação de imóvel urbano de propriedade do Município, com área de 360 m².";
  assert.equal(ehLeilaoDeImovel(texto), false);
  assert.equal(ehLeilaoDeImovel(texto, { leilaoGarantido: true }), true);
});

test("aceita HTML com entidades e devolve posições válidas no texto sem HTML", () => {
  const a = analisarLeilaoImovel("<p>EDITAL DE LEIL&Atilde;O</p><p>Bem: <b>im&oacute;vel</b> residencial.</p>");
  assert.equal(a.aceito, true);
  const primeiro = a.leilao[0];
  assert.ok(primeiro);
  assert.equal(a.texto.slice(primeiro.inicio, primeiro.fim), "LEILÃO");
  const imovel = a.imovelForte[0];
  assert.ok(imovel);
  assert.equal(a.texto.slice(imovel.inicio, imovel.fim), "imóvel");
});

test("cabeçalhos de resultado, extrato, revogação e leilão deserto não anunciam leilão futuro", () => {
  assert.equal(ehAvisoSemLeilaoFuturo("RESULTADO DE LEILÃO Nº 2/2026"), true);
  assert.equal(ehAvisoSemLeilaoFuturo("AVISO DE HOMOLOGAÇÃO"), true);
  assert.equal(ehAvisoSemLeilaoFuturo("Extrato de Contrato nº 12/2026"), true);
  assert.equal(ehAvisoSemLeilaoFuturo("AVISO DE REVOGAÇÃO"), true);
  assert.equal(ehAvisoSemLeilaoFuturo("AVISO DE LEILÃO DESERTO"), true);
  assert.equal(ehAvisoSemLeilaoFuturo("AVISO DE LEILÃO Nº 3/2026"), false);
  assert.equal(ehAvisoSemLeilaoFuturo("EDITAL DE LEILÃO PÚBLICO"), false);
  assert.equal(ehAvisoSemLeilaoFuturo(null), false);
});

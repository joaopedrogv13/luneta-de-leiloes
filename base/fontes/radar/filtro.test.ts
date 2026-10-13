import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { analisarLeilaoImovel, ehAvisoSemLeilaoFuturo, ehLeilaoDeImovel, motivoSemLeilaoFuturo, sinaisDeResultado } from "./filtro.ts";
import { DIR_FIXTURES } from "./testes.ts";

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
  assert.deepEqual(a.moveis, [], "a vaga que 'comporta 1 veículo' não é bem móvel");
  assert.doesNotMatch(a.motivo, /bens móveis/);
  const direitos = analisarLeilaoImovel(LJ_DIREITOS);
  assert.equal(direitos.aceito, true);
  assert.deepEqual(direitos.moveis, [], "'vagas para guarda de automóveis' também não");
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
  assert.equal(
    ehLeilaoDeImovel("Leilão de equipamentos. Galpão de guarda com área total de 200 m², matrícula nº 9."),
    false,
    "com bens móveis, galpão fora do objeto do leilão é o lugar da guarda",
  );
  assert.equal(ehLeilaoDeImovel("Leilão de equipamentos e de um galpão com área total de 200 m², matrícula nº 9."), true, "galpão no objeto");
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

test("leilão de móveis que cita o LOCAL dos bens não vira leilão de imóvel", () => {
  const moveis = [
    "AVISO DE LEILÃO Nº 2/2026. A Prefeitura torna público leilão de veículos e sucatas inservíveis. Os bens poderão ser vistoriados no galpão da Secretaria de Obras.",
    "EDITAL DE LEILÃO. Leilão de veículo automotor penhorado, marca Fiat, ano 2015, que se encontra no imóvel situado à Rua das Flores, 100.",
    "AVISO DE LEILÃO. Alienação de veículos inservíveis. A sessão será realizada no prédio da Prefeitura Municipal, sala de reuniões.",
    "LEILÃO Nº 1/2026 de bens móveis inservíveis (mobiliário e computadores). Local: Edifício Sede do Tribunal.",
    "AVISO DE LEILÃO de veículos. Local: Casa do Leiloeiro, Rua X, 10.",
    "EDITAL DE LEILÃO de veículo automotor localizado no bairro Casa Verde, São Paulo.",
    "LEILÃO de máquinas pesadas que estão no terreno da garagem municipal.",
    "Leilão de gado bovino na Fazenda Santa Rita.",
  ];
  for (const t of moveis) {
    const a = analisarLeilaoImovel(t);
    assert.equal(a.aceito, false, t);
    assert.match(a.motivo, /bens móveis/, t);
  }
  const pncp = analisarLeilaoImovel("Leilão de veículos e máquinas inservíveis. Os bens encontram-se no pátio do imóvel da Secretaria de Agricultura.", { leilaoGarantido: true });
  assert.equal(pncp.aceito, false);
  assert.deepEqual(pncp.imovelLocal.map((s) => s.rotulo), ["imóvel"]);
  assert.match(pncp.motivo, /imóvel citado só como local/);
  // Sem bens móveis, o lugar do evento também não conta ("Local:", "sessão no edifício").
  assert.equal(ehLeilaoDeImovel("Leilão de bens diversos. Local: Edifício Sede."), false);
  assert.equal(ehLeilaoDeImovel("AVISO DE LEILÃO Nº 1/2026-ANEEL. Leilão de energia. A sessão pública será realizada no edifício sede da câmara."), false);
  // Imóvel no objeto continua valendo, com ou sem móveis no mesmo edital.
  assert.equal(ehLeilaoDeImovel("EDITAL DE LEILÃO. Leilão de veículos e de um galpão industrial com 800 m² situado na Rodovia SP-300."), true);
  assert.equal(ehLeilaoDeImovel("Leilão de imóvel rural (Fazenda Boa Vista), com gado e maquinário incluídos."), true);
  assert.equal(ehLeilaoDeImovel("Leilão judicial. Apartamento nº 52 com vaga de garagem para 1 veículo, situado no Edifício Exemplo."), true);
  assert.equal(analisarLeilaoImovel("Apartamento com garagem para 2 veículos. Leilão em 20/11/2026.").moveis.length, 0, "capacidade da garagem não é bem móvel");
});

test("Fazenda de órgão (de/da, perante a Fazenda) não é imóvel rural; Fazenda com nome próprio é", () => {
  for (const t of [
    "AVISO DE LEILÃO. A Secretaria de Estado de Fazenda torna público o leilão de bens apreendidos.",
    "AVISO DE LEILÃO. A Secretaria Municipal de Fazenda e Planejamento comunica leilão de bens apreendidos.",
    "AVISO DE LEILÃO. SECRETARIA DE FAZENDA DO MUNICÍPIO. Leilão de bens apreendidos.",
    "EDITAL DE LEILÃO. Eventuais débitos perante a Fazenda serão sub-rogados no preço.",
    "EDITAL DE LEILÃO. DÉBITOS COM A FAZENDA E COM O CONDOMÍNIO.",
    "Leilão de créditos de contribuintes em débito com a Fazenda Municipal.",
  ]) {
    const a = analisarLeilaoImovel(t);
    assert.ok(!a.imovelForte.some((s) => s.rotulo === "fazenda"), t);
    assert.equal(a.aceito, false, t);
  }
  assert.equal(ehLeilaoDeImovel("EDITAL DE LEILÃO. Bem: FAZENDA BOA VISTA, com 300 ha."), true);
  assert.equal(ehLeilaoDeImovel("Leilão de imóvel rural denominado fazenda São José."), true);
  assert.equal(ehLeilaoDeImovel("Leilão de duas fazendas no oeste do Estado."), true);
});

test("sinais de imóvel de alienação municipal: área urbana/pública, lotes, loteamento, unidade habitacional, residência, sobrado, próprio municipal, bem dominical", () => {
  const objetos = [
    "Alienação de área urbana remanescente com 1.200,00 m2",
    "Alienação de área pública desafetada localizada no Bairro Centro",
    "Venda de lotes no Distrito Industrial, conforme Lei Municipal nº 1.234/2025",
    "Alienação de 3 (três) lotes de propriedade do Município, situados no Loteamento Jardim América",
    "Alienação de unidades habitacionais do conjunto Vila Nova",
    "Alienação de próprio municipal situado na Rua X",
    "Alienação de bem dominical do Estado",
    "Leilão de sobrados e residências da extinta RFFSA",
  ];
  for (const o of objetos) assert.equal(ehLeilaoDeImovel(o, { leilaoGarantido: true }), true, o);
  assert.equal(ehLeilaoDeImovel("EDITAL DE LEILÃO. Bem: uma residência de alvenaria com 3 quartos, matrícula nº 1234."), true);
  assert.equal(ehLeilaoDeImovel("Leilão: sobrado com 2 dormitórios, matrícula 9.999."), true);
  // "Área" sozinha e "lote" de leilão continuam sem contar.
  assert.equal(ehLeilaoDeImovel("Leilão. Área técnica responsável: Secretaria de Administração.", { leilaoGarantido: true }), false);
  assert.equal(ehLeilaoDeImovel("Leilão de 30 lotes de veículos. Os lotes situados no pátio do DETRAN serão vendidos no estado."), false);
  assert.equal(ehLeilaoDeImovel("Leilão de bens. Apresentar comprovante de residência."), false);
});

test("corpus de avisos (fixtures/corpus): nenhum falso positivo em leilão de móveis, nenhum falso negativo em imóvel", () => {
  const corpus = JSON.parse(readFileSync(join(DIR_FIXTURES, "corpus", "avisos.json"), "utf8")) as {
    negativos: Array<{ nota: string; texto: string; garantido?: boolean }>;
    positivos: Array<{ nota: string; texto: string; garantido?: boolean }>;
  };
  assert.ok(corpus.negativos.length >= 40 && corpus.positivos.length >= 25);
  const falsosPositivos = corpus.negativos.filter((c) => ehLeilaoDeImovel(c.texto, { leilaoGarantido: c.garantido })).map((c) => c.nota);
  const falsosNegativos = corpus.positivos.filter((c) => !ehLeilaoDeImovel(c.texto, { leilaoGarantido: c.garantido })).map((c) => c.nota);
  assert.deepEqual(falsosPositivos, []);
  assert.deepEqual(falsosNegativos, []);
});

test("cabeçalhos de resultado, homologação, ata, arrematação, extrato e revogação não anunciam leilão futuro", () => {
  for (const cab of [
    "RESULTADO DE LEILÃO Nº 2/2026", "AVISO DE HOMOLOGAÇÃO", "TERMO DE HOMOLOGAÇÃO", "TERMO DE ADJUDICAÇÃO", "ATA DE LEILÃO Nº 3/2026",
    "AVISO DE ARREMATAÇÃO", "AUTO DE ARREMATAÇÃO", "EDITAL DE INTIMAÇÃO DA ARREMATAÇÃO", "Extrato de Contrato nº 12/2026", "AVISO DE REVOGAÇÃO",
    "RESULTADO DE JULGAMENTO", "AVISO DE CANCELAMENTO DE LEILÃO",
  ]) {
    assert.equal(ehAvisoSemLeilaoFuturo(cab, { dataLeilao: "2026-12-01" }), true, cab);
  }
  assert.equal(ehAvisoSemLeilaoFuturo("AVISO DE LEILÃO Nº 3/2026"), false);
  assert.equal(ehAvisoSemLeilaoFuturo("AVISO DE LICITAÇÃO - LEILÃO Nº 3/2026"), false);
  assert.equal(ehAvisoSemLeilaoFuturo("EDITAL DE LEILÃO PÚBLICO"), false);
  assert.equal(ehAvisoSemLeilaoFuturo(null), false);
});

test("retificação, errata, adiamento e leilão deserto ficam quando trazem data nova de leilão", () => {
  for (const cab of ["AVISO DE RETIFICAÇÃO - LEILÃO Nº 1/2026", "ERRATA - EDITAL DE LEILÃO 2/2026", "AVISO DE LEILÃO DESERTO E NOVA DATA", "AVISO DE ADIAMENTO DE LEILÃO", "AVISO DE SUSPENSÃO DE LEILÃO"]) {
    assert.equal(ehAvisoSemLeilaoFuturo(cab), true, `${cab}: sem data nova, descarta`);
    assert.equal(ehAvisoSemLeilaoFuturo(cab, { dataLeilao: "2026-11-20T13:00:00.000Z" }), false, `${cab}: com data nova, fica`);
  }
  assert.match(motivoSemLeilaoFuturo("AVISO DE LEILÃO DESERTO") ?? "", /sem data nova/);
});

test("marcas de resultado no corpo: título, fato passado e quem ganhou seguido de nome", () => {
  const resultados = [
    "RESULTADO DO LEILÃO Nº 2/2026. Lote 01: terreno urbano com 300 m², arrematado por João Carlos Pereira pelo valor de R$ 50.000,00.",
    "Leilão nº 3/2026 do imóvel (terreno), sendo vencedor JOSÉ ANTÔNIO FERREIRA, com lance de R$ 80.000,00.",
    "HOMOLOGAÇÃO. Fica homologado o leilão nº 3/2026 do imóvel.",
    "Leilão nº 4/2026, imóvel lote 7 da quadra 2, adjudicado a Pedro Henrique Alves.",
    "PODER JUDICIÁRIO. 1ª VARA CÍVEL DE SANTOS. EDITAL DE INTIMAÇÃO DA ARREMATAÇÃO. Fica intimado o executado.",
    "Fica intimado o executado de que o imóvel (apartamento nº 12) foi arrematado em leilão por Carlos Eduardo Mendes.",
    "Prefeitura de Vila Exemplo. Ata da sessão pública de leilão nº 3/2026: compareceram dois licitantes.",
  ];
  for (const t of resultados) assert.ok(sinaisDeResultado(t).length > 0, t);
  // Edital de leilão futuro com as mesmas palavras em sentido genérico.
  const futuros = [
    "EDITAL DE LEILÃO. Será considerado vencedor o licitante que oferecer o maior lance. O bem será arrematado por quem oferecer mais.",
    "SERÁ CONSIDERADO VENCEDOR O LICITANTE QUE OFERECER O MAIOR LANCE PELO IMÓVEL.",
    "O resultado do leilão será publicado no Diário Oficial. Após homologado o resultado, o arrematante assina o auto de arrematação.",
    "1º leilão em 20/11/2026. O imóvel foi adquirido por Fulano de Tal em 2010, conforme R.3 da matrícula.",
  ];
  for (const t of futuros) assert.deepEqual(sinaisDeResultado(t), [], t);
  assert.match(motivoSemLeilaoFuturo(null, { texto: resultados[0] }) ?? "", /resultado do leilão/);
});

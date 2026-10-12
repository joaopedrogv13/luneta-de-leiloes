import { test } from "node:test";
import assert from "node:assert/strict";
import { cnpjValido, cpfValido, mascararDadosPessoais, mascararDocumentos, mascararTrecho, temDocumentoPessoal } from "./lgpd.ts";

// Nomes e documentos abaixo são fictícios (CPF/CNPJ gerados só para passar no dígito verificador).

test("documentos: CPF, CNPJ, RG, e-mail e IP", () => {
  assert.equal(mascararDocumentos("CPF 123.456.789-09"), "CPF [CPF]");
  assert.equal(mascararDocumentos("inscrito no CPF sob nº 12345678909"), "inscrito no CPF sob nº [CPF]");
  assert.equal(mascararDocumentos("CNPJ 12.345.678/0001-95"), "CNPJ [CNPJ]");
  assert.equal(mascararDocumentos("RG nº 12.345.678-9 SSP/SP, solteiro"), "RG nº [RG], solteiro");
  assert.equal(mascararDocumentos("contato: fulano.tal@exemplo.com.br"), "contato: [E-MAIL]");
  assert.equal(mascararDocumentos("lance do IP 192.168.0.10"), "lance do IP [IP]");
  assert.equal(mascararDocumentos("documento 12345678909 avulso"), "documento [CPF] avulso", "11 dígitos com DV válido");
  assert.equal(mascararDocumentos("protocolo 12345678901 avulso"), "protocolo 12345678901 avulso", "11 dígitos com DV inválido ficam");
});

test("documentos: não mascara números de imóvel, dinheiro, processo e contribuinte", () => {
  const textos = [
    "VALOR DA AVALIAÇÃO: R$ 1.700.000,00",
    "Proc. 1000818-76.2020.5.02.0090 - 90ª VT São Paulo/SP",
    "Nº CONTRIBUINTE: 044.110.0039-3",
    "N° do imóvel 1444420699441",
    "CEP: 69980-000",
    "área de 1.700.000.00 m²",
  ];
  for (const t of textos) assert.equal(mascararDocumentos(t), t, t);
});

test("dígitos verificadores", () => {
  assert.ok(cpfValido("12345678909"));
  assert.ok(!cpfValido("12345678900"));
  assert.ok(!cpfValido("11111111111"));
  assert.ok(cnpjValido("12345678000195"));
  assert.ok(!cnpjValido("12345678000100"));
});

test("nomes depois de papéis processuais e contratuais", () => {
  const casos: Array<[string, string]> = [
    ["Executado: JOÃO DA SILVA, brasileiro", "Executado: [NOME], brasileiro"],
    ["Exequente: Maria de Souza Pereira e José Antunes", "Exequente: [NOME]"],
    ["FICAM INTIMADOS OS EXECUTADOS JOÃO DA SILVA E MARIA SOUZA, BEM COMO O CREDOR", "FICAM INTIMADOS OS EXECUTADOS [NOME], BEM COMO O CREDOR"],
    ["devedor fiduciante JOSÉ CARLOS PEREIRA, inscrito", "devedor fiduciante [NOME], inscrito"],
    ["Depositário: o Sr. Antônio Carlos de Oliveira Filho.", "Depositário: o Sr. [NOME]."],
    ["movida por CAIXA ECONÔMICA FEDERAL em face de ROBERTO CARLOS MENDES", "movida por [NOME] em face de [NOME]"],
    ["Proprietário(s): PEDRO ÁLVARES CABRAL; Cônjuge: Maria", "Proprietário(s): [NOME]; Cônjuge: [NOME]"],
    ["Arrematante: Carlos Alberto Nunes", "Arrematante: [NOME]"],
    ["Licitante - ANA PAULA COSTA", "Licitante - [NOME]"],
  ];
  for (const [entrada, esperado] of casos) assert.equal(mascararDadosPessoais(entrada), esperado, entrada);
});

test("padrões reais de editais judiciais e matrículas (nomes trocados por fictícios)", () => {
  const casos: Array<[string, string]> = [
    // Lista de executados da API Leilões Judiciais: (A)(S), empresa com "- ME" e "LTDA.;", separador ";".
    ["EXECUTADO(A)(S): EXEMPLO MARMORARIA LTDA - ME; FULANO GOMES DE TAL; BELTRANA GOMES DE TAL", "EXECUTADO(A)(S): [NOME]"],
    ["EXECUTADO(A)(S): XYZ TRANSPORTE DE VALORES, SEGURANCA E VIGILANCIA LTDA.; CICLANO PAES DE SOUZA; ANA LUNARDI", "EXECUTADO(A)(S): [NOME]"],
    // Atos de matrícula: beneficiário de usufruto com CPF.
    [
      "R.09 - Usufruto vitalício em favor de FULANA SOARES, CPF 123.456.789-09; AV.10 - INDISPONIBILIDADE DE BENS",
      "R.09 - Usufruto vitalício em favor de [NOME], CPF [CPF]; AV.10 - INDISPONIBILIDADE DE BENS",
    ],
    [
      "R11. - Usufruto em favor de BELTRANO BATISTA, CPF 123.456.789-09 e FULANA FURLAN BATISTA, CPF 123.456.789-09",
      "R11. - Usufruto em favor de [NOME], CPF [CPF] e [NOME], CPF [CPF]",
    ],
    ["de titularidade da executada FULANA DE TAL; Av. 08 - Rua A denomina-se Rua Dr. Nuno de Assis", "de titularidade da executada [NOME]; Av. 08 - Rua A denomina-se Rua Dr. Nuno de Assis"],
    ["vendido a Fulano de Tal Souza, brasileiro, casado, comerciante", "vendido a [NOME], brasileiro, casado, comerciante"],
    ["Conforme diligência do Sr. Oficial Fulano Beltrano em 17/04/2018", "Conforme diligência do Sr. [NOME] em 17/04/2018"],
  ];
  for (const [entrada, esperado] of casos) assert.equal(mascararDadosPessoais(entrada), esperado, entrada);
});

test("partes no formato A x B", () => {
  assert.equal(
    mascararDadosPessoais("Processo 1000818-76.2020.5.02.0090 - JOÃO DA SILVA x BANCO DO BRASIL S.A."),
    "Processo 1000818-76.2020.5.02.0090 - [NOME] x [NOME].",
  );
  assert.equal(mascararDadosPessoais("Ação de Execução. CONDOMÍNIO EDIFÍCIO JARDINS x ANA PAULA COSTA"), "Ação de Execução. [NOME] x [NOME]");
  assert.equal(mascararDadosPessoais("terreno de 10 x 20 m"), "terreno de 10 x 20 m");
});

test("não mascara texto de edital sem nome (papéis genéricos, endereços)", () => {
  const textos = [
    "O ARREMATANTE DEVERÁ PAGAR AS DESPESAS. O EXECUTADO DEVERÁ DESOCUPAR",
    "o arrematante Fica responsável pelas despesas",
    "Rua Frei Antônio de Guadalupe, nº 67, apto 21, Vila Prudente.",
    "Local dos bens: Rua Dr. Arnaldo, 455, Cerqueira César, São Paulo/SP",
    "Há outras penhoras. Há indisponibilidade. Imóvel ocupado pelo executado.",
    "Condomínio: Sob responsabilidade do comprador, até o limite de 10% em relação ao valor de avaliação.",
  ];
  for (const t of textos) assert.equal(mascararDadosPessoais(t), t, t);
});

test("idempotente e trecho cortado", () => {
  const texto = "Executado: JOÃO DA SILVA, CPF 123.456.789-09, e-mail joao@exemplo.com";
  const uma = mascararDadosPessoais(texto);
  assert.equal(mascararDadosPessoais(uma), uma);
  assert.ok(!temDocumentoPessoal(uma));
  assert.ok(temDocumentoPessoal(texto));
  const trecho = mascararTrecho(`${"palavra ".repeat(100)}Executado: JOÃO DA SILVA`, 50);
  assert.ok(trecho.length <= 50);
  assert.ok(!trecho.includes("JOÃO"));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { principal } from "../../cli.ts";
import { executarColeta } from "../../coleta.ts";
import { lerTexto } from "../../db.ts";
import { montarExportacao } from "../../exportar.ts";
import { prepararImovel } from "../../gravar.ts";
import { bancoEmMemoria, httpProibido } from "../../testes/apoio.ts";
import type { ImovelNormalizado, MetaColeta, OpcoesColeta, Uf } from "../../tipos.ts";
import { criarClienteHttp, ErroHttp, type ClienteHttp } from "../../util/http.ts";
import { validarImovel } from "../../validar.ts";
import { obterConector } from "../index.ts";
import {
  AVISO_LEGAL,
  criarConectorLeiloesJudiciais,
  ehTransitoria,
  ID_LEILOES_JUDICIAIS,
  interpretarArquivo,
  leiloesJudiciais,
  lotesDaCarga,
  mesclar,
  semCamposPessoais,
  type ConfigLeiloesJudiciais,
} from "./index.ts";
import { acharRespostaRpc, ErroMcp, URL_MCP } from "./mcp.ts";
import {
  areasDoLote,
  avaliacaoNoTexto,
  campoSemPessoa,
  coordenadasDoIframe,
  enderecoDoLote,
  matriculaDoLote,
  normalizarLote,
  pracasDoLote,
  processoDoLote,
  semPartesNoProcesso,
  statusDoLote,
  tipoDoAnexo,
  tribunalDoProcesso,
  valorLJ,
  varaSegura,
} from "./normalizar.ts";
import type { LoteColetado, LoteLJ } from "./tipos.ts";

const FIXTURE = fileURLToPath(new URL("./fixtures/busca-apartamento-sp.json", import.meta.url));
const COLETADO_EM = "2026-10-11T01:35:00.000Z";

interface Fixture {
  coletado_em: string;
  respostas: Array<{ result: { content: Array<{ text: string }> } }>;
}

function carregarFixture(): Fixture {
  return JSON.parse(readFileSync(FIXTURE, "utf8")) as Fixture;
}

/** Os 10 lotes da fixture, crus (como a API manda). */
function lotesDaFixture(): LoteLJ[] {
  const texto = carregarFixture().respostas[0]?.result.content[0]?.text ?? "";
  return (JSON.parse(texto) as { results: LoteLJ[] }).results;
}

function lote(id: number): LoteLJ {
  const achado = lotesDaFixture().find((l) => l.lote_id === id);
  assert.ok(achado, `lote ${id} na fixture`);
  return achado;
}

function normalizar(l: LoteLJ, coletadoEm = COLETADO_EM, extra: Partial<LoteColetado> = {}): ImovelNormalizado {
  const n = normalizarLote({ lote: semCamposPessoais(l), coletado_em: coletadoEm, ...extra });
  assert.ok(n, "lote de imóvel não pode ser descartado");
  return n;
}

/**
 * Nomes sintéticos que a fixture põe no lugar das partes (nenhuma palavra vem do nome real):
 * nenhum pode sobrar depois da normalização.
 */
const NOMES_FICTICIOS = [
  "FULANO DE TAL", "BELTRANO DE TAL", "CICLANA DE TAL", "FULANA SINTETICA ALFA", "FULANO SINTETICO COMETA",
  "BELTRANA SINTETICA DELTA", "CICLANA SINTETICA EPSILON", "FULANA SINTETICA ZETA", "BELTRANA SINTETICA TETA",
  "CICLANO SINTETICO IOTA", "FULANA SINTETICA KAPA", "BELTRANO SINTETICO LAMBDA", "CICLANO SINTETICO SIGMA",
  "FULANO SINTETICO OMICRON", "BELTRANA SINTETICA OMICRON", "CICLANO SINTÉTICO ÔMEGA", "FULANA SINTETICA UPSILON",
  "BELTRANO SINTETICO DE TAL", "CICLANA SINTETICA RHO", "FULANO SINTETICO RHO", "BELTRANA SINTETICA RHO",
  "CICLANO SINTETICO PSI", "FULANO SINTETICO NEBULOSA", "BELTRANO SINTETICO QUASAR", "CICLANA SINTETICA DOS OMEGAS",
  "FULANO SINTETICO DOS OMEGAS", "BELTRANO SINTETICO PULSAR", "USUARIO FICTICIO DE TESTE",
  "111.444.777-35", "529.982.247-25", "123.456.789-09", "424242",
];
/** Palavras dos nomes sintéticos: nenhuma pode sobrar em texto, vara, endereço ou cartório. */
const PALAVRAS_SINTETICAS = /\b(?:FULAN[OA]|BELTRAN[OA]|CICLAN[OA]|SINT[EÉ]TIC[OA]|OMEGAS|QUASAR|PULSAR|NEBULOSA)\b/;

test("fixture: os nomes sintéticos estão todos lá (e saem mascarados)", () => {
  const cru = readFileSync(FIXTURE, "utf8");
  for (const nome of NOMES_FICTICIOS) assert.ok(cru.includes(nome), `a fixture deveria ter ${nome}`);
});

// ---------------------------------------------------------------------------
// Normalização (fixture real, mascarada)
// ---------------------------------------------------------------------------

test("fixture: os 10 lotes normalizam e passam na validação do núcleo", () => {
  const lotes = lotesDaFixture();
  assert.equal(lotes.length, 10);
  for (const l of lotes) assert.deepEqual(validarImovel(normalizar(l)), [], `lote ${String(l.lote_id)}`);
});

test("lote TRT sem 2ª praça (seg nulo): avaliação, preço, processo, matrícula, endereço e áreas", () => {
  const n = normalizar(lote(218898));
  assert.equal(n.id_na_fonte, "218898");
  assert.equal(n.url, "https://www.leiloesjudiciais.com.br/lote/99916/218898");
  assert.equal(n.tipo, "apartamento");
  assert.equal(n.uf, "SP");
  assert.equal(n.cidade, "São Paulo");
  assert.equal(n.modalidade, "leilao");
  assert.equal(n.judicial, true);
  assert.equal(n.valor_avaliacao, 1_700_000);
  assert.equal(n.preco, 1_275_000);
  // Praça única OU desconhecida: não afirma "oferta única"; a praça fica só como dado.
  assert.equal(n.praca_atual, null);
  assert.equal(n.praca_incerta, true);
  assert.deepEqual(n.pracas, [{ numero: 0, data: "2026-09-17T16:05:50.000Z", valor_minimo: 1_275_000 }]);
  assert.equal(n.extras?.regra_praca, "seg_nulo");
  assert.equal(n.extras?.avaliacao_origem, "vl_lanceminimo");
  assert.equal(n.extras?.avaliacao_texto, 1_700_000);
  assert.equal(n.extras?.avaliacao_confere, true);
  assert.equal(n.numero_processo, "0000001-00.2020.5.02.0090");
  assert.equal(n.comitente, "TRT2 – 90ª VT São Paulo/SP");
  assert.equal(n.matricula, "147.300");
  assert.equal(n.cartorio, "6º CARTÓRIO DE REGISTRO DE IMÓVEIS DE SÃO PAULO/SP");
  assert.equal(n.endereco, "Rua Frei Antônio de Guadalupe, nº 67, apto 21, Vila Prudente, São Paulo/SP");
  assert.equal(n.area_privativa, 165.555);
  assert.equal(n.area_total, 435.416);
  assert.equal(n.vagas, 3);
  assert.equal(n.leiloeiro, "Leiloeiro Exemplo Um");
  assert.equal(n.extras?.site_leiloeiro, "https://www.doleiloes.com.br/");
  // Parcelamento judicial não é financiamento bancário.
  assert.equal(n.aceita_parcelamento, true);
  assert.equal(n.aceita_financiamento, null);
  assert.equal(n.ocupacao, null);
  assert.deepEqual(n.fotos, []);
  assert.deepEqual(n.documentos.map((d) => d.tipo), ["edital", "avaliacao", "matricula"]);
  assert.ok(n.documentos.every((d) => d.url.startsWith("https://s3-sa-east-1.amazonaws.com/") && d.url.endsWith(".pdf")));
  assert.ok(n.descricao && !/<[a-z]/i.test(n.descricao), "descrição sem HTML");
  assert.match(n.descricao ?? "", /Há outras penhoras/);
  assert.deepEqual(n.textos?.map((t) => t.origem), ["titulo_leilao", "alerta"]);
});

test("status desatualizado: fechamento no passado vira encerrado mesmo 'Aberto para Lance'", () => {
  const n = normalizar(lote(218898));
  assert.equal(n.extras?.status_fonte, "Aberto para Lance");
  assert.equal(n.status, "encerrado");
  assert.equal(n.extras?.status_motivo, "fechamento_passado");
  // Antes do fechamento, o mesmo lote está ativo.
  const antes = normalizar(lote(218898), "2026-09-17T15:00:00.000Z");
  assert.equal(antes.status, "ativo");
  assert.equal(antes.extras?.status_motivo, undefined);
  // Rótulo de encerramento vale mesmo com data futura.
  assert.equal(normalizar({ ...lote(222141), nm_statuslote: "Arrematado" }).status, "encerrado");
  assert.equal(normalizar({ ...lote(222141), nm_statuslote: "Suspenso" }).extras?.status_motivo, "rotulo_fonte");
  assert.equal(normalizar(lote(222141)).status, "ativo");
  // "Adiado" só mudou a data: com fechamento futuro segue ativo (o rótulo fica em status_fonte).
  const adiado = normalizar({ ...lote(222141), nm_statuslote: "Adiado" });
  assert.equal(adiado.status, "ativo");
  assert.equal(adiado.extras?.status_fonte, "Adiado");
  assert.deepEqual(statusDoLote({ nm_statuslote: "Adiado" }, "2026-12-01T00:00:00.000Z", COLETADO_EM), { status: "ativo", motivo: null });
  assert.deepEqual(statusDoLote({ nm_statuslote: "Adiado" }, "2026-09-01T00:00:00.000Z", COLETADO_EM), { status: "encerrado", motivo: "fechamento_passado" });
  assert.deepEqual(statusDoLote({ nm_statuslote: "Lance Condicional" }, "2026-12-01T00:00:00.000Z", COLETADO_EM), { status: "encerrado", motivo: "rotulo_fonte" });
});

test("sem dt_fechamento: não sai como ativo (217032, do 710º leilão do TRT2, já passado)", () => {
  const n = normalizar(lote(217032));
  assert.equal(lote(217032).dt_fechamento, null);
  assert.equal(lote(217032).nm_statuslote, "Aberto para Lance");
  assert.equal(n.status, "encerrado");
  assert.equal(n.extras?.fechamento_ausente, true);
  assert.equal(n.extras?.status_motivo, "fechamento_ausente");
  assert.deepEqual(statusDoLote({ nm_statuslote: "Aguardando" }, null, COLETADO_EM), { status: "encerrado", motivo: "fechamento_ausente" });
  // Quando a data chega (ex.: get_leilao_details com --detalhes), vale a regra normal.
  const comData = normalizar({ ...lote(217032), dt_fechamento: "2026-11-20 13:00:00-03" });
  assert.equal(comData.status, "ativo");
  assert.equal(comData.extras?.fechamento_ausente, undefined);
  assert.equal(comData.pracas[0]?.data, "2026-11-20T16:00:00.000Z");
});

test("praça pela regra da crítica: ini == seg → 2ª praça; ini == min com seg → 1ª praça", () => {
  const segunda = normalizar(lote(222141));
  assert.equal(segunda.praca_atual, 2);
  assert.equal(segunda.preco, 922_509.85);
  assert.equal(segunda.valor_avaliacao, 1_845_019.7);
  assert.deepEqual(segunda.pracas, [
    { numero: 1, data: null, valor_minimo: null },
    { numero: 2, data: "2026-10-19T19:00:00.000Z", valor_minimo: 922_509.85 },
  ]);
  assert.equal(segunda.extras?.regra_praca, "ini=seg");

  const primeira = normalizar(lote(222069));
  assert.equal(primeira.praca_atual, 1);
  assert.equal(primeira.extras?.status_fonte, "Aguardando");
  assert.equal(primeira.status, "ativo");
  assert.deepEqual(primeira.pracas, [
    { numero: 1, data: "2026-10-23T16:00:00.000Z", valor_minimo: 1_765_684.03 },
    { numero: 2, data: null, valor_minimo: 882_842.02 },
  ]);
  assert.equal(primeira.aceita_parcelamento, false, "1 parcela com 100% de entrada é à vista");

  assert.equal(primeira.praca_incerta, false);

  // Fora da regra: a praça em vigor é desconhecida, mas data e lance ficam como dado.
  const fora = pracasDoLote(100, 200, 50, "2026-11-01T13:00:00.000Z");
  assert.deepEqual(fora, {
    pracas: [{ numero: 0, data: "2026-11-01T13:00:00.000Z", valor_minimo: 100 }],
    praca_atual: null,
    incerta: true,
    regra: "indefinida",
  });
  assert.equal(pracasDoLote(100, 100, 100, null).regra, "indefinida");
  assert.equal(pracasDoLote(100, 200, null, null).regra, "seg_nulo");
});

test("coordenadas do Street View, fotos 640x480 montadas (padrao_url) e anexos tipados", () => {
  const n = normalizar(lote(222141));
  assert.equal(n.lat, -23.6183426);
  assert.equal(n.lon, -46.5705281);
  assert.equal(n.precisao_geo, "rua");
  assert.equal(n.fotos.length, 4);
  const capa = n.fotos[0];
  assert.equal(capa?.url, "https://s3-sa-east-1.amazonaws.com/906de634c48fb7d34136160b4c353ae4/public/fotos/imoveis/640x480/I_1195_590488_Y.webp");
  assert.equal(capa?.tamanho, "640x480");
  assert.equal(capa?.origem, "padrao_url", "URL montada por nós, não veio pronta na resposta");
  assert.equal(capa?.verificada_em, null);
  assert.ok(n.fotos.every((f) => f.origem === "padrao_url" && f.ok === null));
  assert.deepEqual(n.fotos.map((f) => f.ordem), [0, 1, 2, 3]);
  assert.deepEqual(n.documentos.map((d) => d.tipo), ["matricula", "matricula", "matricula", "laudo", "avaliacao", "edital"]);
  assert.equal(n.quartos, 5);
  assert.equal(n.matricula, "13.941");
  assert.equal(n.cartorio, "2º CRI");
  assert.equal(n.comitente, "TJSP");

  // Capa grande conferida por HEAD (--detalhes): ganha a data; se não existe, ficam as URLs prontas.
  const url = capa?.url ?? "";
  const verificada = normalizar(lote(222141), COLETADO_EM, { capa: { url, status: 200, em: "2026-10-11T01:40:00.000Z" } });
  assert.equal(verificada.fotos[0]?.verificada_em, "2026-10-11T01:40:00.000Z");
  assert.equal(verificada.fotos[0]?.ok, true);
  assert.equal(verificada.fotos[1]?.verificada_em, null, "só a capa é conferida");
  const semGrande = normalizar(lote(222141), COLETADO_EM, { capa: { url, status: 403, em: "2026-10-11T01:40:00.000Z" } });
  assert.match(semGrande.fotos[0]?.url ?? "", /\/196x146\/I_1195_590488_Y\.webp$/);
  assert.equal(semGrande.fotos[0]?.tamanho, "196x146");
  assert.equal(semGrande.fotos[0]?.origem, "api", "a URL pronta veio na resposta");
});

test("lote com vários imóveis: sem área, endereço e matrícula; avaliação confere com a soma do texto", () => {
  const n = normalizar(lote(221879));
  assert.equal(n.extras?.lote_multiplo, true);
  assert.equal(n.tipo, "outro");
  assert.equal(n.area_total, null);
  assert.equal(n.endereco, null);
  assert.equal(n.matricula, null);
  assert.equal(n.valor_avaliacao, 1_470_000);
  assert.equal(n.extras?.avaliacao_texto, 1_470_000);
  assert.equal(n.extras?.avaliacao_confere, true);
  // O processo da execução é o do "(Proc. ...)", não o da indisponibilidade citada antes.
  assert.equal(n.numero_processo, "0000015-00.2013.5.15.0128");
  assert.equal(n.comitente, "TRT15 – EXE3 - Piracicaba");
});

test("tipo pela subcategoria (Comerciais) e terreno pelo título", () => {
  const n = normalizar(lote(220169));
  assert.equal(n.tipo, "comercial");
  assert.equal(n.area_terreno, 484);
  assert.equal(n.endereco, "Rua Antônio Furtado de Miranda, 493, Vila Industrial, Presidente Prudente/SP");
  assert.equal(n.matricula, "22.215");
  assert.equal(n.praca_atual, 2);
});

test("avaliação com cautela: oculta pela fonte, inconsistente ou só no texto", () => {
  const base = lote(218898);
  const oculta = normalizar({ ...base, bn_exibeavaliacao: false });
  assert.equal(oculta.valor_avaliacao, null);
  assert.equal(oculta.extras?.avaliacao_origem, "oculta_na_fonte");
  const inconsistente = normalizar({ ...base, vl_lanceinicial: "2000000.00" });
  assert.equal(inconsistente.valor_avaliacao, null, "lance inicial acima do 'mínimo' não pode ser avaliação");
  assert.equal(inconsistente.extras?.avaliacao_origem, "inconsistente");
  const soTexto = normalizar({ ...base, vl_lanceminimo: null });
  assert.equal(soTexto.valor_avaliacao, 1_700_000);
  assert.equal(soTexto.extras?.avaliacao_origem, "texto");
  const diverge = normalizar({ ...base, vl_lanceminimo: "1800000.00" });
  assert.equal(diverge.valor_avaliacao, 1_800_000);
  assert.equal(diverge.extras?.avaliacao_confere, false);
});

test("descarta lote que não é imóvel e recusa lote quebrado", () => {
  assert.equal(normalizarLote({ lote: { ...lote(218898), nm_segmento: "Veículos", nm_categoria: "Carros" }, coletado_em: COLETADO_EM }), null);
  assert.throws(() => normalizarLote({ lote: { ...lote(218898), lote_id: null }, coletado_em: COLETADO_EM }), /lote_id/);
  assert.throws(() => normalizarLote({ lote: { ...lote(218898), nm_estado: "XX" }, coletado_em: COLETADO_EM }), /UF/);
  assert.throws(() => normalizarLote({ lote: { ...lote(218898), leilao_id: null }, coletado_em: COLETADO_EM }), /leilao_id/);
});

test("LGPD: nm_usuario/id_usuario nunca entram e nomes de partes saem mascarados", () => {
  const cru = lote(218898);
  assert.equal(cru.nm_usuario, "USUARIO FICTICIO DE TESTE", "a fixture traz o campo sintético");
  const limpo = semCamposPessoais({ ...cru, lances: [{ ip: "10.0.0.1" }], nm_email: "x@y.z" });
  assert.ok(!("nm_usuario" in limpo) && !("id_usuario" in limpo) && !("lances" in limpo) && !("nm_email" in limpo));
  assert.ok("usuariovistorialotexstatusliberacaoextra" in limpo, "alertas de habilitação não são dado pessoal");
  assert.ok("vl_lance" in limpo, "valor do maior lance não é dado pessoal");

  const todos = JSON.stringify(lotesDaFixture().map((l) => normalizar(l)));
  for (const nome of NOMES_FICTICIOS) assert.ok(!todos.includes(nome), `vazou: ${nome}`);
  assert.doesNotMatch(todos, PALAVRAS_SINTETICAS);
  assert.match(todos, /EXEQUENTE: \[NOME\]/);
  assert.match(todos, /EXECUTADO\(A\)\(S\): \[NOME\]/);
  assert.match(todos, /CPF \[CPF\]/);
});

/** Lote sintético de um imóvel só, com a descrição dada (textos nos formatos que as regex procuram). */
function comDescricao(descricao: string): ImovelNormalizado {
  return normalizar({ ...lote(222141), nm_titulo_lote: "Apartamento - Campinas/SP", nm_descricao: descricao });
}

test("LGPD: vara, endereço e cartório tirados do texto não levam nomes (nem depois do núcleo)", () => {
  const casos: Array<{ texto: string; campo: "comitente" | "endereco" | "cartorio"; esperado: string | null }> = [
    { texto: "(Proc. 1234567-89.2020.8.26.0100 - 2ª Vara Cível - JOÃO DA SILVA SAURO x MARIA PEREIRA LIMA)", campo: "comitente", esperado: "TJSP – 2ª Vara Cível" },
    { texto: "(Processo nº 1234567-89.2020.8.26.0100 - 3ª Vara - Exequente: JOSÉ CARLOS NUNES)", campo: "comitente", esperado: "TJSP – 3ª Vara" },
    { texto: "(Proc. 1234567-89.2020.8.26.0100 - 2ª Vara Cível - JOÃO DA SILVA SAURO)", campo: "comitente", esperado: "TJSP – 2ª Vara Cível" },
    { texto: "(Proc. 1234567-89.2020.8.26.0100 - JOÃO DA SILVA SAURO)", campo: "comitente", esperado: "TJSP" },
    { texto: "(Proc. 1234567-89.2020.8.26.0100 - 1ª Vara Cível - Foro Regional de Santo Amaro, São Paulo/SP)", campo: "comitente", esperado: "TJSP – 1ª Vara Cível - Foro Regional de Santo Amaro - São Paulo/SP" },
    { texto: "Local dos bens: Rua das Flores, 10, Centro, Campinas/SP. Depositário: JOÃO DA SILVA SAURO.", campo: "endereco", esperado: "Rua das Flores, 10, Centro, Campinas/SP" },
    { texto: "Local dos bens: Rua das Flores, 10, em poder de JOÃO DA SILVA SAURO.", campo: "endereco", esperado: "Rua das Flores, 10" },
    { texto: "Local dos bens: Rua Dr. Arnaldo, 455, Cerqueira César, São Paulo/SP. Obs.: imóvel sem vaga.", campo: "endereco", esperado: "Rua Dr. Arnaldo, 455, Cerqueira César, São Paulo/SP" },
    { texto: "Imóvel localizado na Rua das Flores, 10, ocupado por JOÃO DA SILVA SAURO, e outros.", campo: "endereco", esperado: "Rua das Flores, 10" },
    {
      texto: "matrícula nº 12.345 do 1º Cartório de Registro de Imóveis de Campinas, de propriedade de JOÃO DA SILVA SAURO e MARIA PEREIRA LIMA.",
      campo: "cartorio",
      esperado: "1º Cartório de Registro de Imóveis de Campinas",
    },
    { texto: "matrícula nº 12.345 do 1º Cartório de Registro de Imóveis de Campinas em nome de JOÃO DA SILVA SAURO.", campo: "cartorio", esperado: "1º Cartório de Registro de Imóveis de Campinas" },
  ];
  for (const { texto, campo, esperado } of casos) {
    const n = comDescricao(texto);
    assert.equal(n[campo], esperado, texto);
    // O que o núcleo grava (e a exportação publica): sem nome em coluna nenhuma.
    const linha = prepararImovel(n, new Date(COLETADO_EM)).linha;
    const gravado = JSON.stringify(linha);
    for (const nome of ["JOÃO", "SAURO", "MARIA PEREIRA", "JOSÉ CARLOS"]) assert.ok(!gravado.includes(nome), `vazou ${nome} de: ${texto}`);
  }
  // A descrição também perde o nome solto depois da vara (sem papel nem "x").
  assert.equal(comDescricao("(Proc. 1234567-89.2020.8.26.0100 - 2ª Vara Cível - JOÃO DA SILVA SAURO) Apartamento.").descricao, "(Proc. 1234567-89.2020.8.26.0100 - 2ª Vara Cível - [NOME]) Apartamento.");
  assert.equal(semPartesNoProcesso("(Proc. 0000015-00.2013.5.15.0128 - EXE3 - Piracicaba)"), "(Proc. 0000015-00.2013.5.15.0128 - EXE3 - Piracicaba)");
});

test("campoSemPessoa e varaSegura", () => {
  assert.equal(campoSemPessoa("Rua A, 1, ocupado por FULANO DE TAL"), "Rua A, 1");
  assert.equal(campoSemPessoa("6º CRI de São Paulo, na posse de Fulano"), "6º CRI de São Paulo");
  assert.equal(campoSemPessoa("Rua Exemplo, 10 - locado para Fulano Beltrano"), "Rua Exemplo, 10");
  assert.equal(campoSemPessoa("Residencial Jardim das Flores, Rua A, 1"), "Residencial Jardim das Flores, Rua A, 1", "'residencial' não é 'reside'");
  assert.equal(campoSemPessoa("Rua A, 1, CPF 123.456.789-09"), null, "a máscara ainda mudaria: descarta");
  assert.equal(campoSemPessoa("Depositário: FULANO"), null);
  assert.equal(varaSegura("90ª VT São Paulo/SP"), "90ª VT São Paulo/SP");
  assert.equal(varaSegura("EXE3 - Piracicaba"), "EXE3 - Piracicaba");
  assert.equal(varaSegura("DIVEX - Piracicaba"), "DIVEX - Piracicaba");
  assert.equal(varaSegura("FULANO DE TAL x BELTRANO"), null, "1º trecho sem juízo");
  assert.equal(varaSegura("2ª Vara Cível - São José dos Campos"), "2ª Vara Cível", "pode ser nome de pessoa: corta");
});

// ---------------------------------------------------------------------------
// Funções de texto
// ---------------------------------------------------------------------------

test("processo, tribunal e vara", () => {
  assert.deepEqual(processoDoLote("LOTE 1 (Proc. 0000001-00.2020.5.02.0090 - 90ª VT São Paulo/SP) texto"), {
    numero: "0000001-00.2020.5.02.0090",
    vara: "90ª VT São Paulo/SP",
  });
  assert.deepEqual(processoDoLote("AV.10 - INDISPONIBILIDADE - PROC. 0000099-00.2015.5.15.0014. Sem o próprio."), { numero: null, vara: null });
  assert.deepEqual(processoDoLote("Processo nº 0000009-00.2018.8.26.0565, 2ª Vara"), { numero: "0000009-00.2018.8.26.0565", vara: null });
  assert.equal(tribunalDoProcesso("0000009-00.2018.8.26.0565"), "TJSP");
  assert.equal(tribunalDoProcesso("0000009-00.2018.8.19.0001"), "TJRJ");
  assert.equal(tribunalDoProcesso("0000009-00.2018.8.07.0001"), "TJDF");
  assert.equal(tribunalDoProcesso("0000001-00.2020.5.02.0090"), "TRT2");
  assert.equal(tribunalDoProcesso("0000001-00.2020.4.03.6100"), "TRF3");
  assert.equal(tribunalDoProcesso("0000001-00.2020.1.00.0000"), null);
});

test("matrícula, endereço, áreas e coordenadas a partir do texto", () => {
  assert.deepEqual(matriculaDoLote("Imóvel matriculado sob o nº 333.478 do 11º Cartório de Registro de Imóveis de São Paulo/SP. (Proc."), {
    matricula: "333.478",
    cartorio: "11º Cartório de Registro de Imóveis de São Paulo/SP",
  });
  assert.deepEqual(matriculaDoLote("no terreno descrito na matrícula nº 105.211, na qual sob nº 8"), { matricula: null, cartorio: null });
  assert.deepEqual(
    enderecoDoLote("Obs.\nLocalização: Rua Peri Número: 96, Bairro: Estância Balnearia Tupy, ITANHAÉM/SP, CEP: 11740000. Obs.: x"),
    { endereco: "Rua Peri, 96", bairro: "Estância Balnearia Tupy", cep: "11740-000" },
  );
  assert.deepEqual(enderecoDoLote("Local dos bens: Rua A, 1.\nLocal dos bens: Rua B, 2."), { endereco: null, bairro: null, cep: null });
  const areas = areasDoLote("Casa", "área útil de 75,05 m², área total de 120 m², terreno com 250,00 m², 2 dormitórios e quatro (04) vagas");
  assert.deepEqual(areas, { area_privativa: 75.05, area_total: 120, area_terreno: 250, quartos: 2, vagas: 4 });
  assert.deepEqual(coordenadasDoIframe('<iframe src="https://www.google.com/maps/embed?pb=!4v1!6m8!1m7!1sX!2m2!1d-23.5393683713536!2d-46.7175251255593!3f97"></iframe>'), {
    lat: -23.5393684,
    lon: -46.7175251,
  });
  assert.deepEqual(coordenadasDoIframe("https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3657.1!2d-46.65!3d-23.56!2m3"), { lat: -23.56, lon: -46.65 });
  assert.equal(coordenadasDoIframe("!2m2!1d48.85!2d2.35"), null, "fora do Brasil");
  assert.equal(coordenadasDoIframe(null), null);
});

test("valores da API: ponto decimal, número e formato brasileiro", () => {
  assert.equal(valorLJ("1700000.00"), 1_700_000);
  assert.equal(valorLJ("922509.85"), 922_509.85);
  assert.equal(valorLJ(716882.98), 716_882.98);
  assert.equal(valorLJ("1.700.000,00"), 1_700_000);
  assert.equal(valorLJ("0.00"), null);
  assert.equal(valorLJ(null), null);
  assert.equal(valorLJ("abc"), null);
});

test("avaliação no texto e tipo de anexo", () => {
  assert.equal(avaliacaoNoTexto("VALOR DA AVALIAÇÃO: R$ 1.700.000,00 (um milhão)"), 1_700_000);
  assert.equal(avaliacaoNoTexto("Valor Total da Avaliação do Imóvel em R$ 2.300.000 (dois milhões)"), 2_300_000);
  assert.equal(avaliacaoNoTexto("Imóvel AVALIADO em R$ 2.700.000,00."), 2_700_000);
  assert.equal(avaliacaoNoTexto("4.1) AVALIAÇÃO: 730.000,00 ... 4.2) AVALIAÇÃO: 390.000,00"), 1_120_000);
  assert.equal(avaliacaoNoTexto("pelo valor alcançado na arrematação, e não pelo valor da avaliação judicial."), null);
  assert.equal(tipoDoAnexo("LAUDO DE AVALIAÇÃO"), "laudo");
  assert.equal(tipoDoAnexo("CALCULOS ATUALIZADOS - AVALIAÇÃO"), "avaliacao");
  assert.equal(tipoDoAnexo("MATRÍCULA 13.942"), "matricula");
  assert.equal(tipoDoAnexo("EDITAL"), "edital");
  assert.equal(tipoDoAnexo("FOTOS"), "outro");
});

// ---------------------------------------------------------------------------
// Entrada local
// ---------------------------------------------------------------------------

function opcoesLocais(arquivo: string, extra: Partial<OpcoesColeta> = {}) {
  const metas: MetaColeta[] = [];
  const op: OpcoesColeta = { arquivo, http: httpProibido(), informar: (m) => metas.push(m), log: () => undefined, ...extra };
  return { op, metas };
}

async function coletarTudo(conector: ReturnType<typeof criarConectorLeiloesJudiciais>, op: OpcoesColeta): Promise<LoteColetado[]> {
  const saida: LoteColetado[] = [];
  for await (const b of conector.coletar(op)) saida.push(b);
  return saida;
}

test("--fixture: lê a fixture sem rede, informa origem e data de coleta", async () => {
  const { op, metas } = opcoesLocais(FIXTURE);
  const brutos = await coletarTudo(leiloesJudiciais, op);
  assert.equal(brutos.length, 10);
  assert.ok(brutos.every((b) => b.coletado_em === COLETADO_EM));
  assert.ok(brutos.every((b) => !("nm_usuario" in b.lote) && !("id_usuario" in b.lote)));
  assert.deepEqual(metas, [{ origem: FIXTURE, geradoEm: COLETADO_EM }]);
  const limitado = await coletarTudo(leiloesJudiciais, opcoesLocais(FIXTURE, { limite: 3 }).op);
  assert.equal(limitado.length, 3);
});

test("--arquivo no formato da sonda (JSON-RPC + linha de status) e erros de arquivo", async () => {
  const dir = mkdtempSync(join(tmpdir(), "luneta-lj-"));
  try {
    const resposta = { jsonrpc: "2.0", id: 4, ...carregarFixture().respostas[0] };
    const sonda = join(dir, "sonda.txt");
    writeFileSync(sonda, `${JSON.stringify(resposta)}\nHTTP 200 application/json\n`);
    // Sem data declarada, o arquivo é recusado: a data de modificação não vale como data de coleta.
    await assert.rejects(coletarTudo(leiloesJudiciais, opcoesLocais(sonda).op), /não declara quando a resposta foi coletada/);
    const comData = criarConectorLeiloesJudiciais({ coletadoEm: "2026-10-11T01:35:00Z" });
    const { op, metas } = opcoesLocais(sonda);
    const brutos = await coletarTudo(comData, op);
    assert.equal(brutos.length, 10);
    assert.ok(brutos.every((b) => b.coletado_em === COLETADO_EM));
    assert.deepEqual(metas, [{ origem: sonda, geradoEm: COLETADO_EM }]);
    // A variável de ambiente faz o mesmo pela CLI.
    process.env.LUNETA_LJ_COLETADO_EM = "2026-10-11T01:35:00Z";
    try {
      assert.equal((await coletarTudo(leiloesJudiciais, opcoesLocais(sonda).op)).length, 10);
    } finally {
      delete process.env.LUNETA_LJ_COLETADO_EM;
    }
    // Data inválida ou no futuro também é recusada.
    await assert.rejects(coletarTudo(criarConectorLeiloesJudiciais({ coletadoEm: "ontem" }), opcoesLocais(sonda).op), /data inválida/);
    const futura = join(dir, "futura.json");
    writeFileSync(futura, JSON.stringify({ ...carregarFixture(), coletado_em: "2099-01-01T00:00:00Z" }));
    await assert.rejects(coletarTudo(leiloesJudiciais, opcoesLocais(futura).op), /no futuro/);

    const erro = join(dir, "erro.json");
    writeFileSync(erro, JSON.stringify({ jsonrpc: "2.0", id: 6, error: { code: -32602, message: "Invalid params: 'query' parameter is required" } }));
    await assert.rejects(coletarTudo(leiloesJudiciais, opcoesLocais(erro).op), /erro JSON-RPC/);

    const html = join(dir, "bloqueio.html");
    writeFileSync(html, "<!DOCTYPE html><title>Just a moment...</title>");
    await assert.rejects(coletarTudo(leiloesJudiciais, opcoesLocais(html).op), /não contém JSON/);

    const outro = join(dir, "outro.json");
    writeFileSync(outro, JSON.stringify({ status: "ok", service: "leiloesjudiciais-api" }));
    await assert.rejects(coletarTudo(leiloesJudiciais, opcoesLocais(outro).op), /formato desconhecido/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("interpretarArquivo e lotesDaCarga aceitam busca, detalhe, lote solto e busca vazia", () => {
  const busca = { query: "x", results: [{ lote_id: 1 }, { lote_id: 2, nm_usuario: "N" }] };
  assert.deepEqual(lotesDaCarga(busca), [{ lote_id: 1 }, { lote_id: 2 }]);
  // Busca vazia: formato não confirmado na sonda; aceitamos results vazio, ausente ou null com totalResults 0.
  assert.deepEqual(lotesDaCarga({ query: "x", estado: "AC", categoria: "imoveis", totalResults: 0, results: [] }), []);
  assert.deepEqual(lotesDaCarga({ query: "x", estado: "AC", categoria: "imoveis", totalResults: 0 }), []);
  assert.deepEqual(lotesDaCarga({ query: "x", estado: "AC", categoria: "imoveis", totalResults: 0, results: null }), []);
  assert.throws(() => lotesDaCarga({ query: "x", totalResults: 3 }), /formato desconhecido/, "diz que tem lotes e não manda: formato mudou");
  assert.deepEqual(lotesDaCarga({ leilaoId: "9", found: true, details: { lote_id: 9, nm_usuario: null } }), [{ lote_id: 9 }]);
  assert.deepEqual(lotesDaCarga({ leilaoId: "99916", found: true, details: { lote_proximo: { lote_id: 1 } } }), []);
  assert.deepEqual(lotesDaCarga({ found: false }), []);
  assert.deepEqual(interpretarArquivo(JSON.stringify(busca)).cargas, [busca]);
  assert.deepEqual(mesclar({ lote_id: 1, fotos: [{ nm_path: "a" }], nm_descricao: "curta" }, { lote_id: 1, fotos: [], nm_descricao: "longa", novo: 1 }), {
    lote_id: 1,
    fotos: [{ nm_path: "a" }],
    nm_descricao: "longa",
    novo: 1,
  });
});

// ---------------------------------------------------------------------------
// Rede (servidor MCP falso; a rede real não é usada nos testes)
// ---------------------------------------------------------------------------

const ROBOTS_LJ = [
  "User-agent: *", "Disallow: /*?pagina=", "Disallow: /busca", "Allow: /blog", "Allow: /api/mcp/messages",
  "Allow: /api/openapi.json", "Content-Signal: ai-train=no, search=yes, ai-input=yes", "",
].join("\n");

interface ChamadaRpc {
  metodo: string;
  params: Record<string, unknown>;
  id: number;
  momento: number;
  cabecalhos: Record<string, string>;
}

/** Resposta fixa ou montada na hora (recebe o id JSON-RPC da chamada). */
type Resposta = Response | ((id: number) => Response);

interface ServidorFalso {
  /** Lotes por "termo@UF"; o que não estiver aqui volta vazio. */
  buscas?: Record<string, LoteLJ[]>;
  /** Substitui a resposta de tools/call para "termo@UF" (falhas, HTML...). */
  respostaBusca?: Record<string, Resposta>;
  ferramentas?: unknown[];
  detalhes?: Record<string, unknown>;
  robots?: string;
  sse?: boolean;
  heads?: Record<string, number>;
  /** Cabeçalho mcp-session-id devolvido no initialize. */
  sessao?: string;
}

function jsonRpc(id: number, result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), { status: 200, headers: { "content-type": "application/json" } });
}

function cargaTexto(id: number, carga: unknown, sse = false): Response {
  const corpo = JSON.stringify({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(carga, null, 2) }] } });
  if (sse) return new Response(`event: message\ndata: ${corpo}\n\n`, { status: 200, headers: { "content-type": "text/event-stream" } });
  return new Response(corpo, { status: 200, headers: { "content-type": "application/json" } });
}

const FERRAMENTAS = [
  { name: "search_leiloes", inputSchema: { type: "object", properties: { query: {}, estado: {}, categoria: {} }, required: ["query"] } },
  { name: "get_leilao_details", inputSchema: { type: "object", properties: { leilaoId: {} }, required: ["leilaoId"] } },
];

function ambienteRede(servidor: ServidorFalso, config: Partial<ConfigLeiloesJudiciais> = {}) {
  let relogio = Date.parse(COLETADO_EM);
  const chamadas: ChamadaRpc[] = [];
  const urls: string[] = [];
  const esperar = async (ms: number): Promise<void> => {
    relogio += ms;
  };
  const fetchFalso = async (entrada: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const url = String(entrada);
    urls.push(`${init.method ?? "GET"} ${url}`);
    if (url === "https://www.leiloesjudiciais.com.br/robots.txt") return new Response(servidor.robots ?? ROBOTS_LJ, { status: 200 });
    if (url.startsWith("https://s3-sa-east-1.amazonaws.com/robots.txt")) return new Response("<Error/>", { status: 403 });
    if (url.startsWith("https://s3-sa-east-1.amazonaws.com/")) return new Response(null, { status: servidor.heads?.[url] ?? 200 });
    if (url !== URL_MCP || init.method !== "POST") return new Response("não encontrado", { status: 404 });
    const corpo = JSON.parse(String(init.body)) as { id: number; method: string; params: Record<string, unknown> };
    chamadas.push({ metodo: corpo.method, params: corpo.params, id: corpo.id, momento: relogio, cabecalhos: { ...(init.headers as Record<string, string>) } });
    if (corpo.method === "initialize") {
      const r = jsonRpc(corpo.id, { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "Leilões Judiciais MCP Server", version: "1.0.0" } });
      if (servidor.sessao) r.headers.set("mcp-session-id", servidor.sessao);
      return r;
    }
    if (corpo.method === "tools/list") return jsonRpc(corpo.id, { tools: servidor.ferramentas ?? FERRAMENTAS });
    const nome = corpo.params.name;
    const args = corpo.params.arguments as Record<string, string>;
    if (nome === "search_leiloes") {
      const chave = `${args.query}@${args.estado}`;
      const especial = servidor.respostaBusca?.[chave];
      if (especial) return typeof especial === "function" ? especial(corpo.id) : especial;
      const results = servidor.buscas?.[chave] ?? [];
      return cargaTexto(corpo.id, { query: args.query, estado: args.estado, categoria: args.categoria, totalResults: results.length, results }, servidor.sse);
    }
    if (nome === "get_leilao_details") {
      const detalhe = servidor.detalhes?.[String(args.leilaoId)];
      return cargaTexto(corpo.id, detalhe ? { leilaoId: args.leilaoId, found: true, details: detalhe } : { leilaoId: args.leilaoId, found: false });
    }
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: corpo.id, error: { code: -32601, message: "Method not found" } }), { status: 200 });
  };
  const http: ClienteHttp = criarClienteHttp({ fetch: fetchFalso as typeof fetch, agora: () => relogio, esperar });
  const conector = criarConectorLeiloesJudiciais({ ufs: ["SP", "RJ"], termos: ["apartamento", "casa"], agora: () => relogio, esperar, ...config });
  const metas: MetaColeta[] = [];
  const logs: string[] = [];
  const op = (extra: Partial<OpcoesColeta> = {}): OpcoesColeta => ({
    http,
    informar: (m) => metas.push(m),
    log: (m) => logs.push(m),
    ...extra,
  });
  return { conector, chamadas, urls, metas, logs, op, relogio: () => relogio };
}

function loteSintetico(id: number, uf: Uf = "RJ"): LoteLJ {
  return { ...lote(222141), lote_id: id, leilao_id: 1, nm_estado: uf, nm_cidade: "Rio de Janeiro", fotos: [] };
}

test("rede: varre UF × termos via MCP, deduplica por lote_id e espera entre as chamadas", async () => {
  const fixture = lotesDaFixture();
  const amb = ambienteRede({
    buscas: {
      "apartamento@SP": fixture,
      "casa@SP": [fixture[0] as LoteLJ, fixture[3] as LoteLJ],
      "apartamento@RJ": [loteSintetico(900001)],
    },
  });
  const brutos = await coletarTudo(amb.conector, amb.op());
  assert.equal(brutos.length, 11, "10 de SP + 1 do RJ; os repetidos de casa@SP saem");
  assert.deepEqual(brutos.map((b) => b.consulta).filter((c, i, a) => a.indexOf(c) === i), ["apartamento@SP", "apartamento@RJ"]);
  assert.ok(brutos.every((b) => !("nm_usuario" in b.lote)), "nm_usuario apagado na chegada");

  assert.deepEqual(amb.chamadas.map((c) => c.metodo), ["initialize", "tools/list", "tools/call", "tools/call", "tools/call", "tools/call"]);
  const buscas = amb.chamadas.filter((c) => c.metodo === "tools/call");
  assert.deepEqual(buscas.map((c) => c.params), [
    { name: "search_leiloes", arguments: { query: "apartamento", estado: "SP", categoria: "imoveis" } },
    { name: "search_leiloes", arguments: { query: "casa", estado: "SP", categoria: "imoveis" } },
    { name: "search_leiloes", arguments: { query: "apartamento", estado: "RJ", categoria: "imoveis" } },
    { name: "search_leiloes", arguments: { query: "casa", estado: "RJ", categoria: "imoveis" } },
  ]);
  for (let i = 1; i < buscas.length; i++) {
    assert.ok((buscas[i]?.momento ?? 0) - (buscas[i - 1]?.momento ?? 0) >= 3000, "intervalo mínimo de 3 s entre buscas");
  }
  assert.deepEqual(amb.chamadas.map((c) => c.id), [1, 2, 3, 4, 5, 6]);
  for (const c of amb.chamadas) {
    assert.equal(c.cabecalhos["user-agent"], "LunetaDeLeiloes/0.1 (+contato)");
    assert.equal(c.cabecalhos["content-type"], "application/json");
    assert.match(c.cabecalhos.accept ?? "", /application\/json/);
  }
  assert.equal(amb.urls[0], "GET https://www.leiloesjudiciais.com.br/robots.txt", "robots consultado antes da API");
  assert.ok(amb.logs.includes(AVISO_LEGAL));
  assert.equal(amb.metas[0]?.origem, URL_MCP);
  assert.equal(amb.metas[0]?.geradoEm, COLETADO_EM);
  assert.ok(amb.metas.some((m) => /1 de 4 buscas vieram com 10 lotes/.test(m.aviso ?? "")), "avisa que a varredura é parcial");
  assert.equal(amb.conector.capacidades.listaCompleta, false);
});

test("rede: --uf restringe a varredura, --limite para cedo, SSE é aceito e a sessão MCP volta nas chamadas", async () => {
  const amb = ambienteRede({
    buscas: { "apartamento@RJ": [loteSintetico(900001), loteSintetico(900002)], "casa@RJ": [loteSintetico(900003)] },
    sse: true,
    sessao: "sessao-123",
  });
  const brutos = await coletarTudo(amb.conector, amb.op({ uf: "RJ", limite: 2 }));
  assert.deepEqual(brutos.map((b) => b.lote.lote_id), [900001, 900002]);
  const buscas = amb.chamadas.filter((c) => c.metodo === "tools/call");
  assert.equal(buscas.length, 1, "parou ao atingir o limite");
  assert.equal((buscas[0]?.params.arguments as Record<string, string>).estado, "RJ");
  assert.equal(amb.chamadas[0]?.cabecalhos["mcp-session-id"], undefined);
  assert.ok(amb.chamadas.slice(1).every((c) => c.cabecalhos["mcp-session-id"] === "sessao-123"));
});

test("rede: página de bloqueio, 403 do Cloudflare e erro JSON-RPC param a coleta", async () => {
  const html = () => new Response("<!DOCTYPE html><title>Just a moment...</title>", { status: 200, headers: { "content-type": "text/html" } });
  const bloqueio = ambienteRede({ respostaBusca: { "apartamento@SP": html } });
  await assert.rejects(coletarTudo(bloqueio.conector, bloqueio.op()), (e: unknown) => e instanceof ErroHttp && e.motivo === "conteudo");
  assert.equal(bloqueio.chamadas.filter((c) => c.metodo === "tools/call").length, 1, "não insiste depois do bloqueio");

  const desafio = ambienteRede({ respostaBusca: { "apartamento@SP": () => new Response("Just a moment...", { status: 403 }) } });
  await assert.rejects(coletarTudo(desafio.conector, desafio.op()), (e: unknown) => e instanceof ErroHttp && e.status === 403);

  const invalido = () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 3, error: { code: -32602, message: "Invalid params" } }), { status: 200 });
  const rpc = ambienteRede({ respostaBusca: { "apartamento@SP": invalido } });
  await assert.rejects(coletarTudo(rpc.conector, rpc.op()), (e: unknown) => e instanceof ErroMcp && e.codigo === -32602);

  const mudou = ambienteRede({ ferramentas: [{ name: "search_leiloes", inputSchema: { properties: { termo: {} } } }] });
  await assert.rejects(coletarTudo(mudou.conector, mudou.op()), /API mudou/);
  assert.equal(mudou.chamadas.filter((c) => c.metodo === "tools/call").length, 0);

  const proibido = ambienteRede({ robots: "User-agent: *\nDisallow: /api/\n" });
  await assert.rejects(coletarTudo(proibido.conector, proibido.op()), (e: unknown) => e instanceof ErroHttp && e.motivo === "robots");
  assert.equal(proibido.chamadas.length, 0, "robots proíbe: nenhuma chamada à API");
});

test("rede: falha transitória isolada é pulada com aviso; falhas seguidas interrompem", async () => {
  const falha = () => new Response("erro", { status: 503 });
  const amb = ambienteRede({ buscas: { "casa@SP": [loteSintetico(900001, "SP")] }, respostaBusca: { "apartamento@SP": falha } });
  const brutos = await coletarTudo(amb.conector, amb.op());
  assert.equal(brutos.length, 1);
  assert.ok(amb.metas.some((m) => /busca apartamento@SP: HTTP 503/.test(m.aviso ?? "")));
  assert.ok(amb.metas.some((m) => /1 chamada\(s\) falharam/.test(m.aviso ?? "")));

  const fora = ambienteRede({ respostaBusca: { "apartamento@SP": falha, "casa@SP": falha, "apartamento@RJ": falha } });
  await assert.rejects(coletarTudo(fora.conector, fora.op()), /3 falhas seguidas/);
});

function erroRpc(codigo: number, mensagem: string): (id: number) => Response {
  return (id) => new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code: codigo, message: mensagem } }), { status: 200, headers: { "content-type": "application/json" } });
}

test("rede: erro interno JSON-RPC (-32603) numa busca é transitório; busca vazia sem results é aceita", async () => {
  const amb = ambienteRede({
    buscas: { "apartamento@RJ": [loteSintetico(900001)] },
    respostaBusca: {
      "casa@SP": erroRpc(-32603, "Internal error"),
      "casa@RJ": (id) => cargaTexto(id, { query: "casa", estado: "RJ", categoria: "imoveis", totalResults: 0 }),
    },
  });
  const brutos = await coletarTudo(amb.conector, amb.op());
  assert.deepEqual(brutos.map((b) => b.lote.lote_id), [900001]);
  assert.equal(amb.chamadas.filter((c) => c.metodo === "tools/call").length, 4, "seguiu até a última busca");
  assert.ok(amb.metas.some((m) => /busca casa@SP: .*-32603/.test(m.aviso ?? "")));
  assert.ok(amb.metas.some((m) => /1 chamada\(s\) falharam/.test(m.aviso ?? "")));

  const seguidas = ambienteRede({ respostaBusca: { "apartamento@SP": erroRpc(-32603, "x"), "casa@SP": erroRpc(-32001, "y"), "apartamento@RJ": erroRpc(-32603, "z") } });
  await assert.rejects(coletarTudo(seguidas.conector, seguidas.op()), /3 falhas seguidas/);

  assert.equal(ehTransitoria(new ErroMcp("jsonrpc", "x", -32603)), true);
  assert.equal(ehTransitoria(new ErroMcp("jsonrpc", "x", -32050)), true);
  assert.equal(ehTransitoria(new ErroMcp("jsonrpc", "x", -32602)), false, "parâmetro inválido: a API mudou");
  assert.equal(ehTransitoria(new ErroMcp("jsonrpc", "x", -32601)), false);
  assert.equal(ehTransitoria(new ErroMcp("jsonrpc", "x", null)), false);
  assert.equal(ehTransitoria(new ErroMcp("formato", "x")), false);
});

test("rede: get_leilao_details com parâmetro trocado não aborta coleta; com --detalhes vira aviso", async () => {
  const ferramentas = [FERRAMENTAS[0], { name: "get_leilao_details", inputSchema: { type: "object", properties: { id: {} }, required: ["id"] } }];
  const buscas = { "apartamento@SP": [loteSintetico(900001, "SP")] };
  const sem = ambienteRede({ ferramentas, buscas }, { ufs: ["SP"], termos: ["apartamento"] });
  assert.equal((await coletarTudo(sem.conector, sem.op())).length, 1);
  assert.ok(!sem.metas.some((m) => /get_leilao_details/.test(m.aviso ?? "")), "sem --detalhes a ferramenta nem é conferida");

  const com = ambienteRede({ ferramentas, buscas }, { ufs: ["SP"], termos: ["apartamento"] });
  const brutos = await coletarTudo(com.conector, com.op({ detalhes: true }));
  assert.equal(brutos.length, 1);
  assert.equal(brutos[0]?.detalhado, false);
  assert.ok(com.metas.some((m) => /get_leilao_details não tem mais o parâmetro "leilaoId"/.test(m.aviso ?? "")));
  assert.equal(com.chamadas.filter((c) => c.params.name === "get_leilao_details").length, 0);
});

test("rede: --detalhes chama get_leilao_details do mesmo lote e confere a capa por HEAD", async () => {
  const base = lote(222141);
  const detalhe = { ...base, nm_descricao: `${String(base.nm_descricao)}<p>Texto completo do edital.</p>`, nm_usuario: "N" };
  const amb = ambienteRede({ buscas: { "apartamento@SP": [base] }, detalhes: { "222141": detalhe } }, { ufs: ["SP"], termos: ["apartamento"] });
  const brutos = await coletarTudo(amb.conector, amb.op({ detalhes: true }));
  assert.equal(brutos.length, 1);
  const b = brutos[0] as LoteColetado;
  assert.equal(b.detalhado, true);
  assert.ok(!("nm_usuario" in b.lote));
  assert.match(String(b.lote.nm_descricao), /Texto completo do edital/);
  assert.equal(b.capa?.status, 200);
  assert.ok(amb.urls.includes(`HEAD ${b.capa?.url}`));
  const n = normalizarLote(b);
  assert.equal(n?.fotos[0]?.ok, true);
  assert.ok(n?.fotos[0]?.verificada_em);
  const detalhes = amb.chamadas.filter((c) => c.params.name === "get_leilao_details");
  assert.deepEqual(detalhes.map((c) => c.params.arguments), [{ leilaoId: "222141" }]);
});

// ---------------------------------------------------------------------------
// Integração com o núcleo
// ---------------------------------------------------------------------------

test("núcleo: a fixture grava 10 imóveis sem marcar removidos; arquivo mais antigo é recusado", async () => {
  const db = bancoEmMemoria();
  try {
    const agora = new Date("2026-10-12T12:00:00Z");
    const r1 = await executarColeta(db, leiloesJudiciais, { arquivo: FIXTURE, http: httpProibido(), agora });
    assert.equal(r1.status, "sucesso", r1.erro ?? r1.avisos.join("; "));
    assert.equal(r1.novos, 10);
    assert.equal(r1.completa, false, "varredura parcial nunca remove");
    assert.equal(r1.geradoEm, COLETADO_EM);

    const r2 = await executarColeta(db, leiloesJudiciais, { arquivo: FIXTURE, http: httpProibido(), agora });
    assert.equal(r2.status, "sucesso");
    assert.equal(r2.inalterados, 10);

    const linhas = db.prepare("SELECT titulo, descricao, textos, extras, leiloeiro, comitente FROM imovel").all();
    const gravado = JSON.stringify(linhas);
    for (const nome of NOMES_FICTICIOS) assert.ok(!gravado.includes(nome), `vazou no banco: ${nome}`);
    const fonte = db.prepare("SELECT publica_fotos, lista_completa, acesso FROM fonte WHERE id = ?").get(ID_LEILOES_JUDICIAIS);
    assert.deepEqual({ ...fonte }, { publica_fotos: 1, lista_completa: 0, acesso: "api_documentada" });
    const encerrados = db.prepare("SELECT id_na_fonte FROM imovel WHERE status = 'encerrado' ORDER BY id_na_fonte").all().map((l) => String(l.id_na_fonte));
    // Os 4 lotes do 711º leilão do TRT2 fecharam em 17/09; o 217032 (710º) veio sem data de fechamento.
    assert.deepEqual(encerrados, ["217032", "218848", "218898", "218901", "218903"]);
    const fotos = db.prepare("SELECT count(*) AS n FROM foto").get();
    assert.equal(Number(fotos?.n), 24, "5 + 4 + 5 + 5 + 5 (a fixture corta em 5 por lote)");

    const dir = mkdtempSync(join(tmpdir(), "luneta-lj-"));
    try {
      const antigo = join(dir, "antigo.json");
      writeFileSync(antigo, JSON.stringify({ ...carregarFixture(), coletado_em: "2026-10-01T00:00:00.000Z" }));
      const r3 = await executarColeta(db, leiloesJudiciais, { arquivo: antigo, http: httpProibido(), agora });
      assert.equal(r3.status, "invalida");
      assert.match(r3.erro ?? "", /mais antigo/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    const precoHistorico = db.prepare("SELECT count(*) AS n FROM preco_historico").get();
    assert.equal(Number(precoHistorico?.n), 10, "uma linha por imóvel novo, nada do arquivo antigo");
    assert.equal(lerTexto(db.prepare("SELECT data_praca FROM imovel WHERE id_na_fonte = '222141'").get()?.data_praca), "2026-10-19T19:00:00.000Z");
    // Seg nulo: praça em vigor desconhecida (null), mas a data segue em data_praca.
    const segNulo = db.prepare("SELECT praca_atual, data_praca FROM imovel WHERE id_na_fonte = '221879'").get();
    assert.deepEqual({ ...segNulo }, { praca_atual: null, data_praca: "2026-11-04T13:06:00.000Z" });

    // Exportação: só os ativos com data futura; o 217032 (sem data) não sai.
    const exportados = montarExportacao(db, { agora }).imoveis;
    assert.deepEqual(exportados.map((i) => i.id_na_fonte).sort(), ["220169", "221879", "221884", "222069", "222141"]);
    const exportado = exportados.find((i) => i.id_na_fonte === "221879");
    assert.equal(exportado?.praca_atual, null, "não publica 'praça única' quando a fonte não diz");
    assert.equal(exportado?.data_praca, "2026-11-04T13:06:00.000Z");
    // Passada a data, a exportação tira o lote do ar mesmo sem nova coleta.
    const depois = montarExportacao(db, { agora: new Date("2026-11-10T00:00:00Z") }).imoveis.map((i) => i.id_na_fonte);
    assert.ok(!depois.includes("221879") && !depois.includes("222141"));
    const publicado = JSON.stringify(exportados);
    for (const nome of NOMES_FICTICIOS) assert.ok(!publicado.includes(nome), `vazou na exportação: ${nome}`);
    assert.doesNotMatch(publicado, PALAVRAS_SINTETICAS);
  } finally {
    db.close();
  }
});

test("núcleo: resposta antiga sem coletado_em não sobrescreve coleta mais nova (data de modificação não vale)", async () => {
  const db = bancoEmMemoria();
  const dir = mkdtempSync(join(tmpdir(), "luneta-lj-"));
  try {
    const agora = new Date("2026-10-13T12:00:00Z");
    // Coleta 1: resposta de 12/10 com o 222141 a R$ 800.000.
    const fixture = carregarFixture();
    const carga = JSON.parse(fixture.respostas[0]?.result.content[0]?.text ?? "") as { results: LoteLJ[] };
    const novos = carga.results.map((l) => (l.lote_id === 222141 ? { ...l, vl_lanceinicial: "800000.00", vl_lanceinicialsegundoleilao: "800000.00" } : l));
    const nova = join(dir, "nova.json");
    writeFileSync(nova, JSON.stringify({ coletado_em: "2026-10-12T10:00:00Z", respostas: [{ jsonrpc: "2.0", id: 4, result: { content: [{ type: "text", text: JSON.stringify({ ...carga, results: novos }) }] } }] }));
    const r1 = await executarColeta(db, leiloesJudiciais, { arquivo: nova, http: httpProibido(), agora });
    assert.equal(r1.status, "sucesso", r1.erro ?? "");

    // Coleta 2: a resposta de 11/10, sem coletado_em, num arquivo tocado depois (mtime novo).
    const antiga = join(dir, "antiga.txt");
    writeFileSync(antiga, `${JSON.stringify({ jsonrpc: "2.0", id: 4, ...fixture.respostas[0] })}\nHTTP 200 application/json\n`);
    const r2 = await executarColeta(db, leiloesJudiciais, { arquivo: antiga, http: httpProibido(), agora });
    assert.equal(r2.status, "erro");
    assert.match(r2.erro ?? "", /não declara quando a resposta foi coletada/);
    assert.equal(Number(db.prepare("SELECT preco FROM imovel WHERE id_na_fonte = '222141'").get()?.preco), 800000, "preço novo mantido");

    // Com a data verdadeira declarada, o núcleo reconhece que é mais antiga e recusa.
    process.env.LUNETA_LJ_COLETADO_EM = "2026-10-11T01:35:00Z";
    try {
      const r3 = await executarColeta(db, leiloesJudiciais, { arquivo: antiga, http: httpProibido(), agora });
      assert.equal(r3.status, "invalida");
      assert.match(r3.erro ?? "", /mais antigo/);
    } finally {
      delete process.env.LUNETA_LJ_COLETADO_EM;
    }
    assert.equal(Number(db.prepare("SELECT preco FROM imovel WHERE id_na_fonte = '222141'").get()?.preco), 800000);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    db.close();
  }
});

test("CLI: conector registrado como leiloesjudiciais_api e coleta pela fixture", async () => {
  assert.equal(obterConector(ID_LEILOES_JUDICIAIS)?.nome, leiloesJudiciais.nome);
  const dir = mkdtempSync(join(tmpdir(), "luneta-lj-cli-"));
  try {
    const saida: string[] = [];
    const codigo = await principal(["coletar", ID_LEILOES_JUDICIAIS, "--fixture", FIXTURE, "--banco", join(dir, "luneta.db")], {
      http: httpProibido(),
      agora: new Date("2026-10-12T12:00:00Z"),
      saida: (t) => saida.push(t),
      erro: () => undefined,
    });
    assert.equal(codigo, 0, saida.join("\n"));
    assert.match(saida.join("\n"), /de leiloesjudiciais_api: sucesso/);
    assert.match(saida.join("\n"), /novos 10/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("acharRespostaRpc: JSON, lote JSON-RPC e SSE; id diferente ou HTML não valem", () => {
  const msg = { jsonrpc: "2.0", id: 7, result: { ok: true } };
  assert.deepEqual(acharRespostaRpc(JSON.stringify(msg), "application/json", 7), msg);
  assert.deepEqual(acharRespostaRpc(JSON.stringify([{ jsonrpc: "2.0", method: "notifications/x" }, msg]), "application/json", 7), msg);
  assert.deepEqual(acharRespostaRpc(`event: message\ndata: ${JSON.stringify(msg)}\n\n`, "text/event-stream", 7), msg);
  assert.equal(acharRespostaRpc(JSON.stringify(msg), "application/json", 8), null);
  assert.equal(acharRespostaRpc("<html>Just a moment...</html>", "text/html", 7), null);
});

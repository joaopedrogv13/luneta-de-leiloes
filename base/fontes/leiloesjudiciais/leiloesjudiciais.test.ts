import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { principal } from "../../cli.ts";
import { executarColeta } from "../../coleta.ts";
import { lerTexto } from "../../db.ts";
import { bancoEmMemoria, httpProibido } from "../../testes/apoio.ts";
import type { ImovelNormalizado, MetaColeta, OpcoesColeta, Uf } from "../../tipos.ts";
import { criarClienteHttp, ErroHttp, type ClienteHttp } from "../../util/http.ts";
import { validarImovel } from "../../validar.ts";
import { obterConector } from "../index.ts";
import {
  AVISO_LEGAL,
  criarConectorLeiloesJudiciais,
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
  coordenadasDoIframe,
  enderecoDoLote,
  matriculaDoLote,
  normalizarLote,
  pracasDoLote,
  processoDoLote,
  statusDoLote,
  tipoDoAnexo,
  tribunalDoProcesso,
  valorLJ,
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

/** Nomes fictícios que a fixture põe no lugar das partes: nenhum pode sobrar depois da normalização. */
const NOMES_FICTICIOS = [
  "FULANO DE TAL", "BELTRANO DA SILVA", "CICLANA DE SOUZA", "JOANA EXEMPLO PEREIRA", "PEDRO AMOSTRA LIMA",
  "LUCIA FICTICIA ROCHA", "VERA TESTE ALVES", "SILVIA MODELO COSTA", "MARIA TESTE OLIVEIRA", "CARLOS EXEMPLAR ALVES",
  "REGINA FICTICIA MOURA", "ROBERTO AMOSTRA NUNES", "JOSE FICTICIO SANTOS", "JOAO EXEMPLO CAMPOS", "CRISTINA TESTE CAMPOS",
  "JOÃO FICTÍCIO MAGALHÃES", "TEREZA EXEMPLO DIAS", "EDSON AMOSTRA DA SILVA", "PAULA FICTICIA BRITO", "PAULO EXEMPLO BRITO",
  "ELIANA TESTE BRITO", "MARIO AMOSTRA GOMES", "CLAUDIO FICTICIO RAMOS", "HELIO EXEMPLO SOARES", "ESTER TESTE DOS SANTOS",
  "RAIMUNDO AMOSTRA DOS SANTOS", "CRISTIANO FICTICIO MELO", "USUARIO FICTICIO DE TESTE",
  "111.444.777-35", "529.982.247-25", "123.456.789-09", "424242",
];

// ---------------------------------------------------------------------------
// Normalização (fixture real, mascarada)
// ---------------------------------------------------------------------------

test("fixture: os 10 lotes normalizam e passam na validação do núcleo", () => {
  const lotes = lotesDaFixture();
  assert.equal(lotes.length, 10);
  for (const l of lotes) assert.deepEqual(validarImovel(normalizar(l)), [], `lote ${String(l.lote_id)}`);
});

test("lote TRT em praça única: avaliação, preço, processo, matrícula, endereço e áreas", () => {
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
  assert.equal(n.praca_atual, 0);
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
  // Antes do fechamento, o mesmo lote está ativo.
  assert.equal(normalizar(lote(218898), "2026-09-17T15:00:00.000Z").status, "ativo");
  // Rótulo de encerramento vale mesmo com data futura.
  assert.equal(normalizar({ ...lote(222141), nm_statuslote: "Arrematado" }).status, "encerrado");
  assert.equal(normalizar({ ...lote(222141), nm_statuslote: "Suspenso" }).status, "encerrado");
  assert.equal(normalizar(lote(222141)).status, "ativo");
  assert.equal(statusDoLote({ nm_statuslote: "Aguardando" }, null, COLETADO_EM), "ativo");
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

  assert.deepEqual(pracasDoLote(100, 200, 50, null), { pracas: [], praca_atual: null, regra: "indefinida" });
  assert.equal(pracasDoLote(100, 100, 100, null).regra, "indefinida");
});

test("coordenadas do Street View, fotos 640x480 com origem api e anexos tipados", () => {
  const n = normalizar(lote(222141));
  assert.equal(n.lat, -23.6183426);
  assert.equal(n.lon, -46.5705281);
  assert.equal(n.precisao_geo, "rua");
  assert.equal(n.fotos.length, 4);
  const capa = n.fotos[0];
  assert.equal(capa?.url, "https://s3-sa-east-1.amazonaws.com/906de634c48fb7d34136160b4c353ae4/public/fotos/imoveis/640x480/I_1195_590488_Y.webp");
  assert.equal(capa?.tamanho, "640x480");
  assert.equal(capa?.origem, "api");
  assert.equal(capa?.verificada_em, null);
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
  const semGrande = normalizar(lote(222141), COLETADO_EM, { capa: { url, status: 403, em: "2026-10-11T01:40:00.000Z" } });
  assert.match(semGrande.fotos[0]?.url ?? "", /\/196x146\/I_1195_590488_Y\.webp$/);
  assert.equal(semGrande.fotos[0]?.tamanho, "196x146");
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
  assert.match(todos, /EXEQUENTE: \[NOME\]/);
  assert.match(todos, /EXECUTADO\(A\)\(S\): \[NOME\]/);
  assert.match(todos, /CPF \[CPF\]/);
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
    const { op, metas } = opcoesLocais(sonda);
    assert.equal((await coletarTudo(leiloesJudiciais, op)).length, 10);
    assert.match(String(metas[0]?.aviso), /coletado_em/, "sem data declarada, avisa e usa a do arquivo");
    assert.equal(metas[1]?.origem, sonda);

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

test("interpretarArquivo e lotesDaCarga aceitam busca, detalhe e lote solto", () => {
  const busca = { query: "x", results: [{ lote_id: 1 }, { lote_id: 2, nm_usuario: "N" }] };
  assert.deepEqual(lotesDaCarga(busca), [{ lote_id: 1 }, { lote_id: 2 }]);
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

type Resposta = Response | (() => Response);

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
      if (especial) return typeof especial === "function" ? especial() : especial;
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
    const encerrados = db.prepare("SELECT count(*) AS n FROM imovel WHERE status = 'encerrado'").get();
    assert.equal(Number(encerrados?.n), 4, "os 4 lotes do 711º leilão do TRT2 já tinham fechado em 17/09");
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
  } finally {
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

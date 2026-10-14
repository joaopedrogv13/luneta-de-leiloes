import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executarColeta } from "../../../coleta.ts";
import { bancoEmMemoria, httpProibido } from "../../../testes/apoio.ts";
import type { EditalNormalizado, MetaColeta, OpcoesColeta } from "../../../tipos.ts";
import type { ClienteHttp } from "../../../util/http.ts";
import { temDocumentoPessoal } from "../../../util/lgpd.ts";
import { validarEdital } from "../../../validar.ts";
import { DIR_FIXTURES, httpFalso, respostaJson } from "../testes.ts";
import { cidadeDoOrgao, criarConectorDjen, djen, textoMascarado, tribunaisDaUf, ufsDoTribunal, type ComunicacaoDjen } from "./index.ts";

const FIXTURE = join(DIR_FIXTURES, "djen", "comunicacao.json");
const JANELA = { desde: "2026-10-08", ate: "2026-10-09" };
/** Nomes fictícios que a fixture rotula como partes e advogada: nunca podem chegar ao banco. */
const NOMES_ROTULADOS = /FULANO|FICT[IÍ]CIO DE TAL|BELTRANA|CICRANO|EXEMPLAR DA SILVA/i;

function opcoes(http: ClienteHttp, extra: Partial<OpcoesColeta> = {}): OpcoesColeta & { metas: MetaColeta[]; logs: string[] } {
  const metas: MetaColeta[] = [];
  const logs: string[] = [];
  return { http, informar: (m) => metas.push(m), log: (m) => logs.push(m), metas, logs, ...extra };
}

async function coletarTudo(conector: ReturnType<typeof criarConectorDjen>, op: OpcoesColeta): Promise<ComunicacaoDjen[]> {
  const lista: ComunicacaoDjen[] = [];
  for await (const c of conector.coletar(op)) lista.push(c);
  return lista;
}

function item(id: number, texto: string, sigla = "TJSP"): ComunicacaoDjen {
  return { id, data_disponibilizacao: "2026-10-08", siglaTribunal: sigla, nomeOrgao: "1ª Vara Cível de Exemplópolis", texto, meio: "E", ativo: true, link: `https://exemplo.test/${id}` };
}

test("tribunais por UF e UFs por tribunal", () => {
  assert.deepEqual(ufsDoTribunal("TJSP"), ["SP"]);
  assert.deepEqual(ufsDoTribunal("TJDFT"), ["DF"]);
  assert.deepEqual(ufsDoTribunal("trt8"), ["PA", "AP"]);
  assert.deepEqual(ufsDoTribunal("TRF6"), ["MG"]);
  assert.equal(ufsDoTribunal("STJ"), null);
  assert.deepEqual(tribunaisDaUf("SP"), ["TJSP", "TRT2", "TRT15", "TRF3"]);
  assert.deepEqual(tribunaisDaUf("DF"), ["TJDFT", "TRT10", "TRF1"]);
  assert.deepEqual(tribunaisDaUf("MG"), ["TJMG", "TRT3", "TRF6"]);
});

test("cidade pelo nome do órgão", () => {
  assert.deepEqual(cidadeDoOrgao("Vara Cível de Quedas do Iguaçu"), { cidade: "Quedas do Iguaçu", uf: null });
  assert.deepEqual(cidadeDoOrgao("3ª Vara Cível de Taguatinga"), { cidade: "Taguatinga", uf: null });
  assert.deepEqual(cidadeDoOrgao("Cacoal - 3ª Vara Cível"), { cidade: "Cacoal", uf: null });
  assert.deepEqual(cidadeDoOrgao("1ª Vara do Trabalho de Palmas - TO"), { cidade: "Palmas", uf: "TO" });
  assert.deepEqual(cidadeDoOrgao("Vara de Família de São José de Ribamar"), { cidade: "São José de Ribamar", uf: null });
  assert.deepEqual(cidadeDoOrgao("Vara de Execuções Fiscais de São Paulo"), { cidade: "São Paulo", uf: null });
  assert.deepEqual(cidadeDoOrgao("CEJUSC-JT de 2º Grau"), { cidade: null, uf: null });
  assert.deepEqual(cidadeDoOrgao(null), { cidade: null, uf: null });
  // Nomes reais das amostras arquivadas do DJEN.
  assert.deepEqual(cidadeDoOrgao("Ji-Paraná - 3ª Vara Cível"), { cidade: "Ji-Paraná", uf: null });
  assert.deepEqual(cidadeDoOrgao("CON2 - Jundiaí"), { cidade: "Jundiaí", uf: null });
  assert.deepEqual(cidadeDoOrgao("4º Juizado Especial Cível da Capital e de Cabedelo"), { cidade: "Cabedelo", uf: null });
  assert.deepEqual(cidadeDoOrgao("1ª Vara Cível da Comarca de Natal"), { cidade: "Natal", uf: null });
  assert.deepEqual(cidadeDoOrgao("7ª Vara Federal de Juizado Especial Cível da SJMA"), { cidade: null, uf: null });
  assert.deepEqual(cidadeDoOrgao("7ª Vara Federal RN"), { cidade: null, uf: "RN" });
  assert.deepEqual(cidadeDoOrgao("TJMG - 7ª CÂMARA CÍVEL"), { cidade: null, uf: null });
  assert.deepEqual(cidadeDoOrgao("2ª Turma Recursal - Gabinete 02"), { cidade: null, uf: null });
  // Construídos: adjetivos e nome de pessoa não viram cidade.
  for (const nome of [
    "Vara das Execuções Fiscais Municipais", "Vara de Execuções Fiscais Estaduais", "Vara Cível e Ambiental", "Juizado Especial Cível e Criminal Adjunto",
    "1ª Vara Empresarial", "Central de Hastas Públicas Unificadas", "Núcleo de Hastas Públicas", "Vara de Falências e Recuperações Judiciais",
    "Gabinete do Des. João da Silva",
  ]) {
    assert.deepEqual(cidadeDoOrgao(nome), { cidade: null, uf: null }, nome);
  }
  assert.deepEqual(cidadeDoOrgao("1ª Vara Federal Cível e Criminal da SSJ de Feira de Santana-BA"), { cidade: "Feira de Santana", uf: "BA" });
});

test("fixture: só editais ativos de leilão de imóvel viram edital, sem nomes nem CPF", async () => {
  const brutos = await coletarTudo(djen, opcoes(httpProibido(), { arquivo: FIXTURE }));
  assert.equal(brutos.length, 5);
  const editais = brutos.map((b) => djen.normalizar(b)).filter((e): e is EditalNormalizado => e !== null && e.registro === "edital");
  assert.deepEqual(editais.map((e) => e.id_na_fonte), ["900000001", "900000005"], "veículo, intimação de penhora e comunicação cancelada ficam de fora");
  for (const e of editais) {
    assert.deepEqual(validarEdital(e), []);
    const tudo = JSON.stringify(e);
    assert.doesNotMatch(tudo, NOMES_ROTULADOS, "nome de parte ou advogado vazou");
    assert.equal(temDocumentoPessoal(tudo), false, "CPF/CNPJ/e-mail/IP vazou");
  }
  const [tjpr, trt15] = editais;
  assert.ok(tjpr && trt15);
  assert.equal(tjpr.titulo, "Edital de leilão judicial – Vara Cível de Quedas do Iguaçu (TJPR) – Proc. 0009999-11.2017.8.16.0140");
  assert.equal(tjpr.orgao, "Vara Cível de Quedas do Iguaçu – TJPR");
  assert.equal(tjpr.uf, "PR");
  assert.equal(tjpr.cidade, "Quedas do Iguaçu");
  assert.equal(tjpr.publicado_em, "2026-10-08");
  assert.equal(tjpr.data_leilao, "2026-11-25T17:00:00.000Z");
  assert.equal(tjpr.url, "https://projudi.tjpr.jus.br/projudi/processo/validacaoDocumentos.do?_tj=exemplo0001");
  assert.equal(tjpr.site_leilao, "https://www.leiloeiro-exemplo.test", "site do leiloeiro citado no texto");
  assert.equal(trt15.site_leilao, null, "o texto não cita site");
  assert.match(tjpr.resumo ?? "", /^Processo 0009999-11\.2017\.8\.16\.0140; classe Cumprimento de Sentença; documento: Edital\.\n/);
  assert.match(tjpr.resumo ?? "", /executado \[NOME\] \(CPF \[CPF\]\)/);
  assert.match(tjpr.resumo ?? "", /Advogada do exequente: \[NOME\]/);
  assert.match(tjpr.resumo ?? "", /terreno com área total de 450,00 m²/);
  assert.equal(trt15.uf, "SP", "TRT15 só tem SP");
  assert.equal(trt15.cidade, "Campinas");
  assert.equal(trt15.data_leilao, "2026-12-01T14:00:00.000Z");
  assert.match(trt15.resumo ?? "", /RECLAMANTE: \[NOME\]\. RECLAMADO: \[NOME\]\./);
});

test("o texto é mascarado antes do filtro: nomes rotulados somem mesmo sem papel processual antes", () => {
  const c: ComunicacaoDjen = {
    ...item(1, "Ficam intimados Fulana Exemplo Teste e Beltrano Exemplo Teste do leilão do imóvel."),
    destinatarios: [{ nome: "FULANA EXEMPLO TESTE" }],
    destinatarioadvogados: [{ advogado: { nome: "Beltrano Exemplo Teste" } }],
  };
  assert.equal(textoMascarado(c), "Ficam intimados [NOME] e [NOME] do leilão do imóvel.");
  const e = djen.normalizar(c);
  assert.ok(e && e.registro === "edital");
  assert.doesNotMatch(JSON.stringify(e), /Fulana|Beltrano/);
});

test("--uf com arquivo local fica só com os tribunais da UF", async () => {
  const soSp = await coletarTudo(djen, opcoes(httpProibido(), { arquivo: FIXTURE, uf: "SP" }));
  assert.deepEqual(soSp.map((c) => c.siglaTribunal), ["TRT2", "TJSP", "TRT15"]);
});

test("--uf: tribunal de várias UFs (TRF1) só entrega o que é da UF pedida ou não diz a UF", async () => {
  const deFeira = { ...item(1, "EDITAL DE LEILÃO. 1º leilão em 20/11/2026 às 10h. Bem: casa residencial situada na Rua A, nº 1, Feira de Santana/BA, matrícula nº 1.234.", "TRF1"), nomeOrgao: "1ª Vara Federal Cível e Criminal da SSJ de Feira de Santana-BA" };
  const semUf = { ...item(2, "EDITAL DE LEILÃO. 1º leilão em 20/11/2026. Bem: terreno urbano de 300 m².", "TRF1"), nomeOrgao: "Vara Federal Cível" };
  const deRioBranco = { ...item(3, "EDITAL DE LEILÃO. Bem: apartamento situado em Rio Branco/AC.", "TRF1"), nomeOrgao: "Vara Federal Cível" };
  const { http } = httpFalso(() => respostaJson({ status: "success", count: 3, items: [deFeira, semUf, deRioBranco] }));
  const op = opcoes(http, { uf: "AC" });
  const lidos = await coletarTudo(criarConectorDjen({ janela: { desde: "2026-10-08", ate: "2026-10-08" }, termos: ["leilão"] }), op);
  assert.deepEqual(lidos.map((c) => c.id), [2, 3], "a casa de Feira de Santana/BA fica de fora");
  assert.ok(op.metas.some((m) => /1 comunicação\(ões\) de outra UF/.test(m.aviso ?? "")));

  const db = bancoEmMemoria();
  const pasta = mkdtempSync(join(tmpdir(), "luneta-djen-"));
  try {
    const arquivo = join(pasta, "trf1.json");
    writeFileSync(arquivo, JSON.stringify({ status: "success", count: 1, items: [deFeira] }));
    const r = await executarColeta(db, djen, { arquivo, uf: "AC", http: httpProibido() });
    assert.equal(r.status, "sucesso", r.erro ?? "");
    assert.equal(r.editais, 0);
    assert.equal(Number(db.prepare("SELECT count(*) AS n FROM edital").get()?.n), 0, "nada da BA gravado numa coleta da UF AC");
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test("intimação da arrematação e resultado não viram edital, e o nome de quem arrematou não chega ao banco", async () => {
  const arrematacao: ComunicacaoDjen = {
    ...item(10, "EDITAL DE INTIMAÇÃO DA ARREMATAÇÃO. Fica intimado o executado de que o imóvel (apartamento nº 12) foi arrematado em leilão por Carlos Eduardo Mendes, pelo valor de R$ 200.000,00."),
    destinatarios: [{ nome: "OUTRA PESSOA QUALQUER", polo: "P" }],
  };
  const homologacao = item(11, "Leilão do imóvel (terreno urbano, lote 4 da quadra 9). HOMOLOGO a arrematação em favor do licitante Ricardo Alves Moreira.");
  const futuro = item(12, "EDITAL DE LEILÃO. 1º leilão em 20/11/2026. Será considerado vencedor o licitante que oferecer o maior lance. Bem: apartamento nº 3.");
  assert.equal(djen.normalizar(arrematacao), null);
  assert.equal(djen.normalizar(homologacao), null);
  assert.ok(djen.normalizar(futuro), "edital futuro com 'vencedor' genérico continua");

  const db = bancoEmMemoria();
  const pasta = mkdtempSync(join(tmpdir(), "luneta-djen-"));
  try {
    const arquivo = join(pasta, "resultado.json");
    writeFileSync(arquivo, JSON.stringify({ status: "success", count: 3, items: [arrematacao, homologacao, futuro] }));
    const r = await executarColeta(db, djen, { arquivo, http: httpProibido() });
    assert.equal(r.status, "sucesso", r.erro ?? "");
    assert.equal(r.editais, 1);
    assert.equal(r.descartados, 2);
    assert.doesNotMatch(JSON.stringify(db.prepare("SELECT * FROM edital").all()), /Carlos|Eduardo|Mendes|Ricardo|Moreira/);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test("janela sem comunicações: coleta vazia legítima, não inválida", async () => {
  const { http } = httpFalso(() => respostaJson({ status: "success", count: 0, items: [] }));
  const r = await executarColeta(bancoEmMemoria(), criarConectorDjen({ janela: JANELA, termos: ["leilão"] }), { http });
  assert.equal(r.status, "sucesso", r.erro ?? "");
  assert.equal(r.lidos, 0);
});

test("rede: meio=E, um dia por consulta, termos e tribunais; deduplica entre termos e pagina de 100 em 100", async () => {
  const cheia = Array.from({ length: 100 }, (_, i) => item(1000 + i, "Edital de leilão de apartamento."));
  const { http, pedidos } = httpFalso((url) => {
    const p = url.searchParams;
    if (p.get("texto") === "leilão" && p.get("dataDisponibilizacaoInicio") === "2026-10-08") {
      return respostaJson({ status: "success", message: "Sucesso", count: 101, items: p.get("pagina") === "1" ? cheia : [item(2000, "Leilão de casa.")] });
    }
    if (p.get("texto") === "hasta pública") return respostaJson({ status: "success", count: 1, items: [item(1000, "Hasta pública de apartamento.")] });
    return respostaJson({ status: "success", count: 0, items: [] });
  });
  const op = opcoes(http);
  const lidos = await coletarTudo(criarConectorDjen({ janela: JANELA, tribunais: ["tjsp"] }), op);
  assert.equal(lidos.length, 101, "o id 1000 repetido em 'hasta pública' é ignorado");
  const consultas = pedidos.map((x) => x.url.searchParams);
  assert.ok(consultas.every((q) => q.get("meio") === "E" && q.get("siglaTribunal") === "TJSP" && q.get("itensPorPagina") === "100"));
  assert.ok(consultas.every((q) => q.get("dataDisponibilizacaoInicio") === q.get("dataDisponibilizacaoFim")));
  assert.deepEqual(
    consultas.map((q) => `${q.get("dataDisponibilizacaoInicio")}|${q.get("texto")}|${q.get("pagina")}`),
    ["2026-10-08|leilão|1", "2026-10-08|leilão|2", "2026-10-08|hasta pública|1", "2026-10-09|leilão|1", "2026-10-09|hasta pública|1"],
  );
  assert.equal(pedidos[0]?.url.origin + (pedidos[0]?.url.pathname ?? ""), "https://comunicaapi.pje.jus.br/api/v1/comunicacao");
  assert.ok(pedidos.every((x) => !x.url.pathname.endsWith("/robots.txt")));
});

test("rede: sem tribunais consulta todos; com --uf consulta TJ, TRTs e TRF; termos do ambiente", async () => {
  const { http, pedidos } = httpFalso(() => respostaJson({ status: "success", count: 0, items: [] }));
  await coletarTudo(criarConectorDjen({ janela: { desde: "2026-10-08", ate: "2026-10-08" }, ambiente: {} }), opcoes(http));
  assert.equal(pedidos.length, 2);
  assert.ok(pedidos.every((x) => !x.url.searchParams.has("siglaTribunal")));

  const comUf = httpFalso(() => respostaJson({ status: "success", count: 0, items: [] }));
  await coletarTudo(
    criarConectorDjen({ janela: { desde: "2026-10-08", ate: "2026-10-08" }, ambiente: { LUNETA_DJEN_TERMOS: "praça" } }),
    opcoes(comUf.http, { uf: "SP" }),
  );
  assert.deepEqual(comUf.pedidos.map((x) => `${x.url.searchParams.get("siglaTribunal")}:${x.url.searchParams.get("texto")}`), ["TJSP:praça", "TRT2:praça", "TRT15:praça", "TRF3:praça"]);
});

test("rede: 429 espera 1 minuto e repete; janela de requisições no fim pausa; erro da API para a coleta", async () => {
  let vezes = 0;
  const { http } = httpFalso(() => {
    vezes++;
    if (vezes <= 2) return respostaJson({ message: "Too Many Requests" }, 429);
    return respostaJson({ status: "success", count: 0, items: [] }, 200, { "x-ratelimit-remaining": "1" });
  });
  const esperas: number[] = [];
  const op = opcoes(http);
  await coletarTudo(criarConectorDjen({ janela: { desde: "2026-10-08", ate: "2026-10-08" }, termos: ["leilão"], esperar: async (ms) => void esperas.push(ms) }), op);
  assert.deepEqual(esperas, [60_000, 60_000], "uma espera pelo 429 (o cliente já repetiu uma vez) e uma pela janela no fim");
  assert.ok(op.logs.some((l) => /janela de requisições do IP no fim/.test(l)));

  const erro = httpFalso(() => respostaJson({ status: "error", message: "Parâmetro inválido" }));
  await assert.rejects(coletarTudo(criarConectorDjen({ janela: JANELA }), opcoes(erro.http)), /status "error": Parâmetro inválido/);
  const antigo = httpFalso(() => respostaJson({ status: "success", count: 1, itens: [item(7, "Leilão de terreno.")] }));
  const lidos = await coletarTudo(criarConectorDjen({ janela: { desde: "2026-10-08", ate: "2026-10-08" }, termos: ["leilão"] }), opcoes(antigo.http));
  assert.deepEqual(lidos.map((c) => c.id), [7], "aceita `itens` (formato antigo)");
});

test("coleta pelo núcleo: nada de nome rotulado ou CPF no banco", async () => {
  const db = bancoEmMemoria();
  const r = await executarColeta(db, djen, { arquivo: FIXTURE, http: httpProibido() });
  assert.equal(r.status, "sucesso", r.erro ?? "");
  assert.equal(r.editais, 2);
  const linhas = db.prepare("SELECT * FROM edital").all();
  const tudo = JSON.stringify(linhas);
  assert.doesNotMatch(tudo, NOMES_ROTULADOS);
  assert.equal(temDocumentoPessoal(tudo), false);
  assert.doesNotMatch(tudo, /destinatario|advogado"|polo/i, "campos de partes não são gravados");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { executarColeta } from "../../../coleta.ts";
import { bancoEmMemoria, httpProibido } from "../../../testes/apoio.ts";
import type { EditalNormalizado, MetaColeta, OpcoesColeta } from "../../../tipos.ts";
import type { ClienteHttp } from "../../../util/http.ts";
import { validarEdital } from "../../../validar.ts";
import { DIR_FIXTURES, httpFalso, respostaJson, respostaVazia, type Rota } from "../testes.ts";
import { criarConectorPncp, linkDoEdital, localDoEdital, partesDoControle, pncp, type BrutoPncp, type ContratacaoPncp } from "./index.ts";

const FIXTURE = join(DIR_FIXTURES, "pncp", "publicacao.json");
const JANELA = { desde: "2026-10-01", ate: "2026-10-08" };

function opcoes(http: ClienteHttp, extra: Partial<OpcoesColeta> = {}): OpcoesColeta & { metas: MetaColeta[] } {
  const metas: MetaColeta[] = [];
  return { http, informar: (m) => metas.push(m), log: () => undefined, metas, ...extra };
}

async function coletarTudo(conector: ReturnType<typeof criarConectorPncp>, op: OpcoesColeta): Promise<BrutoPncp[]> {
  const brutos: BrutoPncp[] = [];
  for await (const bruto of conector.coletar(op)) brutos.push(bruto);
  return brutos;
}

function contratacao(seq: number, objeto: string, modalidade = 1): ContratacaoPncp {
  return {
    numeroControlePNCP: `11222333000181-1-${String(seq).padStart(6, "0")}/2026`,
    anoCompra: 2026,
    sequencialCompra: seq,
    numeroCompra: `${seq}/2026`,
    objetoCompra: objeto,
    modalidadeId: modalidade,
    modalidadeNome: modalidade === 13 ? "Leilão - Presencial" : modalidade === 1 ? "Leilão - Eletrônico" : "Pregão - Eletrônico",
    orgaoEntidade: { cnpj: "11222333000181", razaoSocial: "MUNICIPIO DE EXEMPLOPOLIS" },
    unidadeOrgao: { ufSigla: "SP", municipioNome: "Exemplópolis", nomeUnidade: "MUNICIPIO DE EXEMPLOPOLIS" },
    dataPublicacaoPncp: "2026-10-05T10:00:00",
    dataEncerramentoProposta: "2026-11-10T10:00:00",
  };
}

function envelope(data: ContratacaoPncp[], paginasRestantes: number, totalPaginas = 1): Response {
  return respostaJson({ data, totalRegistros: data.length, totalPaginas, numeroPagina: 1, paginasRestantes, empty: data.length === 0 });
}

test("número de controle e link público do edital", () => {
  assert.deepEqual(partesDoControle("07424905000138-1-000212/2026"), { cnpj: "07424905000138", ano: 2026, sequencial: 212 });
  assert.deepEqual(partesDoControle("07424905000138-1-000212/2024-000001"), { cnpj: "07424905000138", ano: 2024, sequencial: 212 });
  assert.equal(partesDoControle("X-1/2025"), null);
  assert.equal(linkDoEdital("07424905000138-1-000212/2026"), "https://pncp.gov.br/app/editais/07424905000138/2026/212");
});

test("fixture: leilão de imóvel vira edital válido; veículos e concessão de uso são descartados", async () => {
  const op = opcoes(httpProibido(), { arquivo: FIXTURE, detalhes: true });
  const brutos = await coletarTudo(pncp, op);
  assert.equal(brutos.length, 4);
  const editais = brutos.map((b) => pncp.normalizar(b)).filter((e): e is EditalNormalizado => e !== null && e.registro === "edital");
  assert.deepEqual(editais.map((e) => e.id_na_fonte), ["11222333000181-1-000045/2026", "44555666000172-1-000007/2026"]);
  for (const e of editais) assert.deepEqual(validarEdital(e), [], e.id_na_fonte);

  const [imovel, misto] = editais;
  assert.ok(imovel && misto);
  assert.equal(imovel.url, "https://pncp.gov.br/app/editais/11222333000181/2026/45");
  assert.equal(imovel.uf, "SP");
  assert.equal(imovel.cidade, "Exemplópolis");
  assert.equal(imovel.publicado_em, "2026-10-08");
  assert.equal(imovel.data_leilao, "2026-11-10T13:00:00.000Z", "encerramento das propostas, 10h de Brasília");
  assert.equal(imovel.orgao, "MUNICIPIO DE EXEMPLOPOLIS – PREFEITURA MUNICIPAL DE EXEMPLOPOLIS");
  assert.match(imovel.titulo, /^Leilão - Eletrônico nº 3\/2026 – MUNICIPIO DE EXEMPLOPOLIS: Alienação/);
  assert.match(imovel.resumo ?? "", /Valor total estimado: R\$ 185\.000,00\./);
  // Arquivos do edital no campo próprio (não no resumo), sem o inativo.
  assert.deepEqual(imovel.documentos, [
    { tipo: "edital", titulo: "Edital do Leilão nº 3/2026", url: "https://pncp.gov.br/pncp-api/v1/orgaos/11222333000181/compras/2026/45/arquivos/1", publicado_em: "2026-10-08" },
    { tipo: "laudo", titulo: "Anexo I - Laudo de avaliação", url: "https://pncp.gov.br/pncp-api/v1/orgaos/11222333000181/compras/2026/45/arquivos/2", publicado_em: "2026-10-08" },
  ]);
  assert.doesNotMatch(imovel.resumo ?? "", /Arquivos do edital|Minuta substituída/);
  assert.deepEqual(misto.documentos, [], "--detalhes sem arquivos na fixture: consultado e vazio");
  assert.equal(misto.data_leilao, "2026-11-20T12:30:00.000Z", "sem encerramento, vale a abertura");
  assert.equal(misto.uf, "MG", "órgão estadual sem local no texto: a UF do órgão");
  assert.equal(misto.cidade, null, "mas não a cidade da sede");
  assert.deepEqual(op.metas[0], { origem: FIXTURE });
});

test("fixture sem --detalhes não lista arquivos; --uf filtra pelo órgão", async () => {
  const semDetalhes = await coletarTudo(pncp, opcoes(httpProibido(), { arquivo: FIXTURE }));
  assert.ok(semDetalhes.every((b) => b.arquivos === null));
  const primeiro = pncp.normalizar(semDetalhes[0] as BrutoPncp);
  assert.ok(primeiro && primeiro.registro === "edital");
  assert.equal(primeiro.documentos, null, "sem --detalhes: arquivos não consultados");
  const soMg = await coletarTudo(pncp, opcoes(httpProibido(), { arquivo: FIXTURE, uf: "MG" }));
  assert.deepEqual(soMg.map((b) => b.contratacao.sequencialCompra), [7, 8]);
});

test("rede: consulta 1 e 13 em publicação e propostas abertas, pagina, deduplica e busca arquivos só do que é imóvel", async () => {
  const imovelA = contratacao(1, "Alienação de imóvel urbano: terreno com 300 m².");
  const veiculo = contratacao(2, "Leilão de veículos e sucatas.");
  const imovelB = contratacao(3, "Alienação de apartamento residencial.");
  const imovelC = contratacao(4, "Leilão de galpão industrial desativado.");
  const rota: Rota = (url) => {
    const p = url.searchParams;
    if (url.pathname.endsWith("/arquivos")) {
      if (url.pathname.includes("/compras/2026/3/")) return respostaVazia(404);
      return respostaJson([{ sequencialDocumento: 1, titulo: "Edital", url: `https://pncp.gov.br/pncp-api/v1${url.pathname.split("/v1")[1]}/1`, statusAtivo: true }]);
    }
    const consulta = url.pathname.split("/").pop();
    const modalidade = p.get("codigoModalidadeContratacao");
    if (consulta === "publicacao" && modalidade === "1") {
      return p.get("pagina") === "1" ? envelope([imovelA, veiculo], 1, 2) : envelope([imovelB], 0, 2);
    }
    if (consulta === "proposta" && modalidade === "1") return envelope([imovelA, imovelC], 0);
    return respostaVazia(204);
  };
  const { http, pedidos } = httpFalso(rota);
  const conector = criarConectorPncp({ janela: JANELA });
  const op = opcoes(http, { uf: "SP", detalhes: true });
  const brutos = await coletarTudo(conector, op);

  assert.deepEqual(brutos.map((b) => [b.contratacao.sequencialCompra, b.consulta]), [[1, "publicacao"], [2, "publicacao"], [3, "publicacao"], [4, "proposta"]]);
  assert.equal(brutos[1]?.arquivos, null, "veículo: arquivos não consultados");
  assert.deepEqual(brutos[2]?.arquivos, [], "404 em /arquivos = lista vazia");
  assert.equal(brutos[0]?.arquivos?.length, 1);

  const consultas = pedidos.filter((p) => p.url.pathname.startsWith("/api/consulta/"));
  const primeira = consultas[0]?.url.searchParams;
  assert.equal(primeira?.get("dataInicial"), "20261001");
  assert.equal(primeira?.get("dataFinal"), "20261008");
  assert.equal(primeira?.get("tamanhoPagina"), "50");
  assert.equal(primeira?.get("uf"), "SP");
  const proposta = consultas.find((p) => p.url.pathname.endsWith("/proposta"))?.url.searchParams;
  assert.equal(proposta?.get("dataFinal"), "20270205", "fim da janela + 120 dias");
  assert.equal(proposta?.has("dataInicial"), false);
  assert.deepEqual(
    consultas.map((p) => `${p.url.pathname.split("/").pop()}:${p.url.searchParams.get("codigoModalidadeContratacao")}:${p.url.searchParams.get("pagina")}`),
    ["publicacao:1:1", "publicacao:1:2", "proposta:1:1", "publicacao:13:1", "proposta:13:1"],
  );
  assert.ok(pedidos.every((p) => !p.url.pathname.endsWith("/robots.txt")), "API documentada: sem robots.txt");
  assert.ok(pedidos.every((p) => p.cabecalhos["user-agent"]?.startsWith("LunetaDeLeiloes/0.1")), "User-Agent identificado");
  assert.ok(op.metas.some((m) => m.origem?.includes("modalidades 1, 13")));
});

test("rede: 400 passageiro do PNCP é repetido; JSON fora do formato e HTML no lugar de JSON param a coleta", async () => {
  let tentativas = 0;
  const { http } = httpFalso((url) => {
    if (url.searchParams.get("codigoModalidadeContratacao") !== "1") return respostaVazia(204);
    tentativas++;
    return tentativas === 1 ? respostaJson({ message: 'For input string: ""' }, 400) : envelope([contratacao(1, "Alienação de imóvel.")], 0);
  });
  const esperas: number[] = [];
  const conector = criarConectorPncp({ janela: JANELA, incluirAbertas: false, esperar: async (ms) => void esperas.push(ms) });
  const brutos = await coletarTudo(conector, opcoes(http));
  assert.equal(brutos.length, 1);
  assert.deepEqual(esperas, [5000]);

  const html = httpFalso(() => new Response("<html><body>Manutenção</body></html>", { status: 200, headers: { "content-type": "text/html" } }));
  await assert.rejects(coletarTudo(criarConectorPncp({ janela: JANELA }), opcoes(html.http)), /Resposta não é JSON/);
  const formato = httpFalso(() => respostaJson({ itens: [] }));
  await assert.rejects(coletarTudo(criarConectorPncp({ janela: JANELA }), opcoes(formato.http)), /envelope sem a lista `data`/);
});

test("rede: com LUNETA_RADAR_ROBOTS=1, robots.txt que proíbe /api/ para a coleta antes de consultar", async () => {
  const { http, pedidos } = httpFalso((url) =>
    url.pathname === "/robots.txt" ? new Response("User-agent: *\nDisallow: /api/\n", { status: 200 }) : envelope([contratacao(1, "Alienação de imóvel.")], 0),
  );
  const conector = criarConectorPncp({ janela: JANELA, ambiente: { LUNETA_RADAR_ROBOTS: "1" } });
  await assert.rejects(coletarTudo(conector, opcoes(http)), /robots\.txt não permite/);
  assert.deepEqual(pedidos.map((p) => p.url.pathname), ["/robots.txt"]);
});

test("rede: modalidade que não é leilão para o código pedido para a coleta (conflito 1/13 × 4)", async () => {
  const { http } = httpFalso(() => envelope([contratacao(9, "Aquisição de imóvel para sede", 6)], 0));
  await assert.rejects(coletarTudo(criarConectorPncp({ janela: JANELA }), opcoes(http)), /tabela de modalidades mudou\?/);
});

test("coleta completa pelo núcleo: grava só editais, repete sem duplicar e falha sem gravar nada", async () => {
  const db = bancoEmMemoria();
  const r1 = await executarColeta(db, pncp, { arquivo: FIXTURE, http: httpProibido(), agora: new Date("2026-10-12T12:00:00Z") });
  assert.equal(r1.status, "sucesso", r1.erro ?? "");
  assert.equal(r1.editais, 2);
  assert.equal(r1.descartados, 2);
  assert.equal(Number(db.prepare("SELECT count(*) AS n FROM edital").get()?.n), 2);
  assert.equal(Number(db.prepare("SELECT count(*) AS n FROM imovel").get()?.n), 0);
  const fonte = db.prepare("SELECT finalidade, acesso, lista_completa FROM fonte WHERE id = 'pncp'").get();
  assert.deepEqual({ ...fonte }, { finalidade: "radar", acesso: "api_documentada", lista_completa: 0 });

  const r2 = await executarColeta(db, pncp, { arquivo: FIXTURE, http: httpProibido(), agora: new Date("2026-10-13T12:00:00Z") });
  assert.equal(r2.status, "sucesso");
  assert.equal(Number(db.prepare("SELECT count(*) AS n FROM edital").get()?.n), 2);
  assert.equal(db.prepare("SELECT ultima_vez_em AS u FROM edital LIMIT 1").get()?.u, "2026-10-13T12:00:00.000Z");

  // Página 2 cai: nada da página 1 pode ser gravado.
  const { http } = httpFalso((url) => (url.searchParams.get("pagina") === "1" ? envelope([contratacao(50, "Alienação de terreno.")], 1, 2) : respostaVazia(503)));
  const r3 = await executarColeta(db, criarConectorPncp({ janela: JANELA }), { http, agora: new Date("2026-10-14T12:00:00Z") });
  assert.equal(r3.status, "erro");
  assert.match(r3.erro ?? "", /HTTP 503/);
  assert.equal(Number(db.prepare("SELECT count(*) AS n FROM edital").get()?.n), 2);
});

test("local do imóvel: o texto vence a sede do órgão; sem texto, só órgão municipal dá cidade e estadual dá UF", () => {
  const federal = (objeto: string): ContratacaoPncp => ({
    ...contratacao(10, objeto),
    orgaoEntidade: { cnpj: "00489828000155", razaoSocial: "MINISTERIO DA GESTAO E DA INOVACAO EM SERVICOS PUBLICOS", esferaId: "F" },
    unidadeOrgao: { ufSigla: "DF", municipioNome: "Brasília", nomeUnidade: "SECRETARIA DO PATRIMONIO DA UNIAO" },
  });
  assert.deepEqual(localDoEdital(federal("Alienação de imóvel da União localizado no Município de Recife/PE, com área de 500,00 m².")), { uf: "PE", cidade: "Recife" });
  assert.deepEqual(localDoEdital(federal("Alienação de imóvel da União, com área de 500,00 m².")), { uf: null, cidade: null }, "a sede do ministério não é o lugar do imóvel");
  assert.deepEqual(localDoEdital(contratacao(11, "Alienação de imóvel urbano do Município.")), { uf: "SP", cidade: "Exemplópolis" }, "órgão municipal");
  const estadual: ContratacaoPncp = { ...contratacao(12, "Alienação de imóvel do Estado."), orgaoEntidade: { razaoSocial: "SECRETARIA DE ESTADO DE ADMINISTRACAO", esferaId: "E" } };
  assert.deepEqual(localDoEdital(estadual), { uf: "SP", cidade: null }, "órgão estadual: só a UF");
  const e = pncp.normalizar({ contratacao: federal("Alienação de imóvel da União localizado no Município de Recife/PE."), arquivos: null, consulta: "arquivo" });
  assert.ok(e && e.registro === "edital");
  assert.deepEqual([e.uf, e.cidade], ["PE", "Recife"]);
});

test("rede: com --uf, edital cujo texto põe o imóvel em outra UF sai; 204 em tudo é janela vazia legítima", async () => {
  const noDf = { ...contratacao(20, "Alienação de imóvel situado em Brasília/DF."), unidadeOrgao: { ufSigla: "SP", municipioNome: "Exemplópolis" } };
  const emSp = contratacao(21, "Alienação de terreno urbano com 300 m².");
  const { http } = httpFalso((url) =>
    url.searchParams.get("codigoModalidadeContratacao") === "1" && url.pathname.endsWith("/publicacao") ? envelope([noDf, emSp], 0) : respostaVazia(204),
  );
  const op = opcoes(http, { uf: "SP" });
  const brutos = await coletarTudo(criarConectorPncp({ janela: JANELA }), op);
  assert.deepEqual(brutos.map((b) => b.contratacao.sequencialCompra), [21]);
  assert.ok(op.metas.some((m) => /1 edital\(is\) com imóvel em outra UF/.test(m.aviso ?? "")));

  const vazio = httpFalso(() => respostaVazia(204));
  const db = bancoEmMemoria();
  const r = await executarColeta(db, criarConectorPncp({ janela: JANELA }), { http: vazio.http, agora: new Date("2026-10-12T12:00:00Z") });
  assert.equal(r.status, "sucesso", r.erro ?? "");
  assert.equal(r.lidos, 0);
  assert.match(r.avisos.join(" "), /Nenhum registro no período/);
});

test("arquivos do edital: coleta sem --detalhes (ou pela /proposta) não apaga o que --detalhes gravou", async () => {
  const db = bancoEmMemoria();
  const documentos = (): Array<[unknown, unknown]> =>
    db.prepare("SELECT id_na_fonte, documentos FROM edital ORDER BY id_na_fonte").all().map((l) => [l.id_na_fonte, JSON.parse(String(l.documentos ?? "null"))]);
  const r1 = await executarColeta(db, pncp, { arquivo: FIXTURE, detalhes: true, http: httpProibido(), agora: new Date("2026-10-12T12:00:00Z") });
  assert.equal(r1.status, "sucesso", r1.erro ?? "");
  const comArquivos = documentos();
  assert.equal(comArquivos[0]?.[0], "11222333000181-1-000045/2026");
  assert.equal((comArquivos[0]?.[1] as unknown[]).length, 2);

  const r2 = await executarColeta(db, pncp, { arquivo: FIXTURE, http: httpProibido(), agora: new Date("2026-10-13T12:00:00Z") });
  assert.equal(r2.status, "sucesso", r2.erro ?? "");
  assert.deepEqual(documentos(), comArquivos, "sem --detalhes, os arquivos ficam");

  // Rede: o mesmo edital volta pela /proposta, sem --detalhes.
  const doFixture = (JSON.parse(readFileSync(FIXTURE, "utf8")) as { paginas: Array<{ data: ContratacaoPncp[] }> }).paginas[0]?.data[0];
  assert.ok(doFixture);
  const { http } = httpFalso((url) =>
    url.pathname.endsWith("/proposta") && url.searchParams.get("codigoModalidadeContratacao") === "1" ? envelope([doFixture], 0) : respostaVazia(204),
  );
  const r3 = await executarColeta(db, criarConectorPncp({ janela: JANELA }), { http, agora: new Date("2026-10-14T12:00:00Z") });
  assert.equal(r3.status, "sucesso", r3.erro ?? "");
  assert.deepEqual(documentos(), comArquivos);
});

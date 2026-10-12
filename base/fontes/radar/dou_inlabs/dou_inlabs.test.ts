import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executarColeta } from "../../../coleta.ts";
import { bancoEmMemoria, httpProibido } from "../../../testes/apoio.ts";
import type { EditalNormalizado, MetaColeta, OpcoesColeta } from "../../../tipos.ts";
import type { ClienteHttp } from "../../../util/http.ts";
import { validarEdital } from "../../../validar.ts";
import { criarZip, DIR_FIXTURES, httpFalso, respostaBytes, respostaVazia } from "../testes.ts";
import { cookieDeSessao, criarConectorDouInlabs, douInlabs, lerArtigosDou, type ArtigoDou } from "./index.ts";

const PASTA = join(DIR_FIXTURES, "dou_inlabs", "2026-10-09-DO3");
const XMLS = readdirSync(PASTA).filter((n) => n.endsWith(".xml")).sort();
const SENHA = "senha-de-teste-123";

function opcoes(http: ClienteHttp, extra: Partial<OpcoesColeta> = {}): OpcoesColeta & { metas: MetaColeta[]; logs: string[] } {
  const metas: MetaColeta[] = [];
  const logs: string[] = [];
  return { http, informar: (m) => metas.push(m), log: (m) => logs.push(m), metas, logs, ...extra };
}

async function coletarTudo(conector: ReturnType<typeof criarConectorDouInlabs>, op: OpcoesColeta): Promise<ArtigoDou[]> {
  const lista: ArtigoDou[] = [];
  for await (const a of conector.coletar(op)) lista.push(a);
  return lista;
}

function zipDaFixture(extra: Array<{ nome: string; dados: Uint8Array | string }> = []): Uint8Array {
  return criarZip([...XMLS.map((nome) => ({ nome: `2026-10-09-DO3/${nome}`, dados: new Uint8Array(readFileSync(join(PASTA, nome))) })), ...extra]);
}

test("lê atributos e campos da matéria; comentário com <article> não atrapalha", () => {
  const [artigo] = lerArtigosDou(readFileSync(join(PASTA, XMLS[0] ?? ""), "utf8"), "a.xml");
  assert.ok(artigo);
  assert.equal(artigo.atributos.id, "90000001");
  assert.equal(artigo.atributos.pubName, "DO3");
  assert.equal(artigo.atributos.pubDate, "09/10/2026");
  assert.equal(artigo.atributos.pdfPage, "http://pesquisa.in.gov.br/imprensa/jsp/visualiza/index.jsp?data=09/10/2026&jornal=530&pagina=87");
  assert.equal(artigo.identifica, "AVISO DE LEILÃO Nº 3/2026");
  assert.equal(artigo.ementa, null, "<Ementa /> vazio");
  assert.equal(artigo.data, null, "CDATA vazio");
  assert.match(artigo.texto ?? "", /^<p class="identifica">/);
  assert.equal(lerArtigosDou("<xml><!-- <article id=\"x\"></article> --></xml>", "c.xml").length, 0);
  assert.equal(lerArtigosDou('<xml><article id="1" name="A &amp; B"><body><Texto>sem &lt;CDATA&gt;</Texto></body></article></xml>', "d.xml")[0]?.texto, "sem <CDATA>");
});

test("fixture: só o aviso de leilão de imóvel vira edital; assinatura e cabeçalho repetido somem", async () => {
  const artigos = await coletarTudo(douInlabs, opcoes(httpProibido(), { arquivo: PASTA }));
  assert.equal(artigos.length, 4);
  const editais = artigos.map((a) => douInlabs.normalizar(a)).filter((e): e is EditalNormalizado => e !== null && e.registro === "edital");
  assert.equal(editais.length, 1, "veículos, resultado e pregão ficam de fora");
  const [e] = editais;
  assert.ok(e);
  assert.deepEqual(validarEdital(e), []);
  assert.equal(e.id_na_fonte, "90000001");
  assert.equal(e.titulo, "AVISO DE LEILÃO Nº 3/2026 – Superintendência do Patrimônio da União no Estado de São Paulo");
  assert.equal(e.orgao, "Ministério da Gestão e da Inovação em Serviços Públicos / Secretaria do Patrimônio da União / Superintendência do Patrimônio da União no Estado de São Paulo");
  assert.equal(e.uf, "SP");
  assert.equal(e.cidade, "Santos");
  assert.equal(e.publicado_em, "2026-10-09");
  assert.equal(e.data_leilao, "2026-11-17T13:00:00.000Z");
  assert.equal(e.url, "http://pesquisa.in.gov.br/imprensa/jsp/visualiza/index.jsp?data=09/10/2026&jornal=530&pagina=87");
  assert.doesNotMatch(e.resumo ?? "", /SIGNATÁRIA|Superintendente$/);
  assert.equal((e.resumo ?? "").match(/AVISO DE LEILÃO Nº 3\/2026/g)?.length, 1);
  assert.match(e.resumo ?? "", /apartamento nº 34 do Edifício Modelo/);
});

test("normalizar: outra seção, cabeçalho de resultado, sem id e sem pdfPage", () => {
  const base: ArtigoDou = {
    atributos: { id: "1", pubName: "DO3", pubDate: "09/10/2026" },
    identifica: "AVISO DE LEILÃO",
    data: null, ementa: null, titulo: null, subTitulo: null,
    texto: "<p>Leilão de terreno urbano de 300 m² em 20/11/2026.</p>",
    arquivo: "x.xml",
  };
  assert.equal(douInlabs.normalizar({ ...base, atributos: { ...base.atributos, pubName: "DO1" } }), null);
  assert.equal(douInlabs.normalizar({ ...base, identifica: "RESULTADO DE JULGAMENTO DE LEILÃO" }), null);
  assert.throws(() => douInlabs.normalizar({ ...base, atributos: { pubName: "DO3" } }), /sem id/);
  const semPdf = douInlabs.normalizar(base);
  assert.ok(semPdf && semPdf.registro === "edital");
  assert.equal(semPdf.url, "https://www.in.gov.br/leiturajornal?data=09-10-2026&secao=do3");
});

test("entrada local em ZIP: lê só os XML e confere o pacote", async () => {
  const pasta = mkdtempSync(join(tmpdir(), "luneta-dou-"));
  const caminho = join(pasta, "2026-10-09-DO3.zip");
  writeFileSync(caminho, zipDaFixture([{ nome: "2026-10-09-DO3/imagem.jpg", dados: new Uint8Array([0xff, 0xd8]) }]));
  const artigos = await coletarTudo(douInlabs, opcoes(httpProibido(), { arquivo: caminho }));
  assert.deepEqual(artigos.map((a) => a.atributos.id), ["90000001", "90000002", "90000003", "90000004"]);
  const soSp = await coletarTudo(douInlabs, opcoes(httpProibido(), { arquivo: caminho, uf: "SP" }));
  assert.deepEqual(soSp.map((a) => a.atributos.id), ["90000001"]);
  const vazio = join(pasta, "vazio.zip");
  writeFileSync(vazio, criarZip([{ nome: "leia-me.txt", dados: "nada" }]));
  await assert.rejects(coletarTudo(douInlabs, opcoes(httpProibido(), { arquivo: vazio })), /ZIP sem arquivos XML/);
});

test("cookie de sessão nos Set-Cookie", () => {
  const h = new Headers();
  h.append("set-cookie", "outro=1; path=/");
  h.append("set-cookie", "inlabs_session_cookie=abc123; path=/; HttpOnly");
  assert.equal(cookieDeSessao(h), "abc123");
  const apagado = new Headers({ "set-cookie": "inlabs_session_cookie=deleted; expires=Thu, 01 Jan 1970 00:00:01 GMT" });
  assert.equal(cookieDeSessao(apagado), null);
  assert.equal(cookieDeSessao(new Headers()), null);
});

function loginFalso(respostas: Array<() => Response>): { fetchLogin: typeof fetch; pedidos: RequestInit[] } {
  const pedidos: RequestInit[] = [];
  let i = 0;
  const fetchLogin = (async (_url: string | URL | Request, init?: RequestInit) => {
    pedidos.push(init ?? {});
    const proxima = respostas[Math.min(i++, respostas.length - 1)];
    return (proxima ?? (() => respostaVazia(500)))();
  }) as typeof fetch;
  return { fetchLogin, pedidos };
}

const LOGIN_OK = (): Response => new Response(null, { status: 302, headers: { location: "/index.php", "set-cookie": "inlabs_session_cookie=sessao-xyz; path=/" } });

test("rede: login com cookie no 302, download do DO3 com o cookie, 404 = dia sem edição", async () => {
  const { fetchLogin, pedidos: logins } = loginFalso([LOGIN_OK]);
  const { http, pedidos } = httpFalso((url) =>
    url.searchParams.get("dl") === "2026-10-09-DO3.zip" ? respostaBytes(zipDaFixture()) : respostaVazia(404),
  );
  const esperas: number[] = [];
  const conector = criarConectorDouInlabs({
    janela: { desde: "2026-10-09", ate: "2026-10-10" },
    fetchLogin,
    esperar: async (ms) => void esperas.push(ms),
    ambiente: { INLABS_EMAIL: "dono@exemplo.test", INLABS_SENHA: SENHA },
  });
  const op = opcoes(http);
  const artigos = await coletarTudo(conector, op);
  assert.equal(artigos.length, 4);

  assert.equal(logins.length, 1);
  assert.equal(logins[0]?.method, "POST");
  assert.equal(logins[0]?.redirect, "manual", "o cookie vem no 302: não seguir redirecionamento");
  assert.equal(String(logins[0]?.body), `email=dono%40exemplo.test&password=${SENHA}`);
  const cabecalhosLogin = logins[0]?.headers as Record<string, string>;
  assert.match(cabecalhosLogin["user-agent"] ?? "", /^LunetaDeLeiloes\/0\.1/);
  assert.equal(cabecalhosLogin.origem, "736372697074");

  assert.deepEqual(pedidos.map((p) => p.url.searchParams.get("dl")), ["2026-10-09-DO3.zip", "2026-10-09-DO3E.zip", "2026-10-10-DO3.zip", "2026-10-10-DO3E.zip"]);
  assert.ok(pedidos.every((p) => p.cabecalhos.cookie === "inlabs_session_cookie=sessao-xyz" && p.cabecalhos.origem === "736372697074"));
  assert.ok(pedidos.every((p) => p.url.origin === "https://inlabs.in.gov.br" && p.url.pathname === "/index.php" && p.url.searchParams.get("p") === p.url.searchParams.get("dl")?.slice(0, 10)));
  assert.deepEqual(esperas, [2000], "pausa educada entre login e primeiro download");
  const registro = JSON.stringify([op.logs, op.metas]);
  assert.doesNotMatch(registro, new RegExp(`${SENHA}|sessao-xyz|dono@`), "senha, e-mail e cookie não aparecem em log");
  assert.ok(op.logs.some((l) => /2026-10-10 DO3: sem edição \(404\)/.test(l)));
});

test("rede: login sem cookie é recusado; 503 no login é repetido; HTML no lugar do ZIP para a coleta", async () => {
  const semCookie = loginFalso([() => new Response("<html>Usuário ou senha inválidos</html>", { status: 200 })]);
  const conector = (fetchLogin: typeof fetch, esperar: (ms: number) => Promise<void> = async () => undefined) =>
    criarConectorDouInlabs({ janela: { desde: "2026-10-09", ate: "2026-10-09" }, fetchLogin, esperar, ambiente: { INLABS_EMAIL: "a@b.test", INLABS_SENHA: SENHA } });
  await assert.rejects(coletarTudo(conector(semCookie.fetchLogin), opcoes(httpProibido())), /Login no INLABS recusado \(HTTP 200, sem cookie de sessão\)/);

  const instavel = loginFalso([() => respostaVazia(503), () => respostaVazia(503), LOGIN_OK]);
  const esperas: number[] = [];
  const { http } = httpFalso(() => respostaVazia(404));
  await coletarTudo(conector(instavel.fetchLogin, async (ms) => void esperas.push(ms)), opcoes(http));
  assert.equal(instavel.pedidos.length, 3);
  assert.deepEqual(esperas, [2000, 4000, 2000]);

  const html = httpFalso(() => new Response("<!DOCTYPE html><html><body>Faça login</body></html>", { status: 200, headers: { "content-type": "text/html" } }));
  await assert.rejects(coletarTudo(conector(loginFalso([LOGIN_OK]).fetchLogin), opcoes(html.http)), /página HTML .*sessão expirada/);
});

test("com LUNETA_RADAR_ROBOTS=1, robots.txt que proíbe o login impede a coleta (sem tentar logar)", async () => {
  const login = loginFalso([LOGIN_OK]);
  const { http } = httpFalso((url) => (url.pathname === "/robots.txt" ? new Response("User-agent: *\nDisallow: /logar.php\n") : respostaVazia(404)));
  const conector = criarConectorDouInlabs({
    janela: { desde: "2026-10-09", ate: "2026-10-09" },
    fetchLogin: login.fetchLogin,
    ambiente: { INLABS_EMAIL: "a@b.test", INLABS_SENHA: SENHA, LUNETA_RADAR_ROBOTS: "1" },
  });
  await assert.rejects(coletarTudo(conector, opcoes(http)), /robots\.txt do INLABS não permite/);
  assert.equal(login.pedidos.length, 0);
});

test("sem credenciais a coleta pela rede para com instrução clara", async () => {
  await assert.rejects(
    coletarTudo(criarConectorDouInlabs({ janela: { desde: "2026-10-09", ate: "2026-10-09" }, ambiente: {} }), opcoes(httpProibido())),
    /Defina INLABS_EMAIL e INLABS_SENHA/,
  );
});

test("coleta pelo núcleo com a pasta de XML grava o edital sem a assinatura", async () => {
  const db = bancoEmMemoria();
  const r = await executarColeta(db, douInlabs, { arquivo: PASTA, http: httpProibido() });
  assert.equal(r.status, "sucesso", r.erro ?? "");
  assert.equal(r.editais, 1);
  assert.equal(r.descartados, 3);
  const linha = db.prepare("SELECT titulo, uf, cidade, resumo FROM edital").get();
  assert.equal(linha?.uf, "SP");
  assert.doesNotMatch(String(linha?.resumo), /SIGNATÁRIA/);
});

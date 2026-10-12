import { test } from "node:test";
import assert from "node:assert/strict";
import { criarClienteHttp, ErroHttp, lerRetryAfter, USER_AGENT_PADRAO, type ConfigHttp } from "./http.ts";

type Rota = (init: RequestInit) => Response | Promise<Response>;

interface Chamada {
  url: string;
  metodo: string;
  cabecalhos: Record<string, string>;
}

/** fetch falso por URL, relógio controlado e registro de esperas. */
function ambiente(rotas: Record<string, Rota | Rota[]>, extra: Partial<ConfigHttp> = {}) {
  const chamadas: Chamada[] = [];
  const esperas: number[] = [];
  let relogio = 0;
  const contadores = new Map<string, number>();
  const fetchFalso = async (entrada: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const url = String(entrada);
    chamadas.push({ url, metodo: init.method ?? "GET", cabecalhos: { ...(init.headers as Record<string, string>) } });
    const rota = rotas[url];
    if (!rota) return new Response("não encontrado", { status: 404 });
    if (Array.isArray(rota)) {
      const n = contadores.get(url) ?? 0;
      contadores.set(url, n + 1);
      const r = rota[Math.min(n, rota.length - 1)];
      if (!r) throw new Error("rota vazia");
      return r(init);
    }
    return rota(init);
  };
  const cliente = criarClienteHttp({
    fetch: fetchFalso as typeof fetch,
    agora: () => relogio,
    esperar: async (ms) => {
      esperas.push(ms);
      relogio += ms;
    },
    ...extra,
  });
  return { cliente, chamadas, esperas, avancar: (ms: number) => (relogio += ms) };
}

const ok = (corpo: string, cabecalhos: Record<string, string> = {}): Rota => () => new Response(corpo, { status: 200, headers: cabecalhos });
const status = (s: number, cabecalhos: Record<string, string> = {}): Rota => () => new Response("x", { status: s, headers: cabecalhos });
const ROBOTS_LIVRE = { "https://fonte.test/robots.txt": ok("User-agent: *\nDisallow: /privado\n") };

test("User-Agent identificado, robots consultado uma vez por origem", async () => {
  const { cliente, chamadas } = ambiente({ ...ROBOTS_LIVRE, "https://fonte.test/a": ok("A"), "https://fonte.test/b": ok("B") });
  assert.equal(await cliente.texto("https://fonte.test/a"), "A");
  assert.equal(await cliente.texto("https://fonte.test/b"), "B");
  assert.deepEqual(chamadas.map((c) => c.url), ["https://fonte.test/robots.txt", "https://fonte.test/a", "https://fonte.test/b"]);
  assert.equal(USER_AGENT_PADRAO, "LunetaDeLeiloes/0.1 (+contato)");
  assert.ok(chamadas.every((c) => c.cabecalhos["user-agent"] === cliente.userAgent));
});

test("robots.txt: caminho proibido não é acessado", async () => {
  const { cliente, chamadas } = ambiente({ ...ROBOTS_LIVRE, "https://fonte.test/privado/1": ok("segredo") });
  await assert.rejects(cliente.texto("https://fonte.test/privado/1"), (e: unknown) => e instanceof ErroHttp && e.motivo === "robots");
  assert.ok(!chamadas.some((c) => c.url.includes("/privado/")));
  assert.equal(await cliente.permitido("https://fonte.test/publico"), true);
});

test("robots.txt 404 libera; 5xx bloqueia por precaução (RFC 9309)", async () => {
  const livre = ambiente({ "https://a.test/x": ok("ok") });
  assert.equal(await livre.cliente.texto("https://a.test/x"), "ok");
  const fora = ambiente({ "https://b.test/robots.txt": status(503), "https://b.test/x": ok("ok") });
  await assert.rejects(fora.cliente.texto("https://b.test/x"), (e: unknown) => e instanceof ErroHttp && e.motivo === "robots" && /precaução/.test(e.message));
  assert.ok(!fora.chamadas.some((c) => c.url === "https://b.test/x"));
});

test("retentativas com espera exponencial em 503 e Retry-After em 429", async () => {
  const { cliente, chamadas, esperas } = ambiente(
    { ...ROBOTS_LIVRE, "https://fonte.test/lista": [status(503), status(429, { "retry-after": "7" }), ok("enfim")] },
    { intervaloMinimoMs: 0, esperaBaseMs: 1000 },
  );
  const r = await cliente.requisitar("https://fonte.test/lista");
  assert.equal(r.texto, "enfim");
  assert.equal(r.tentativas, 3);
  assert.equal(chamadas.filter((c) => c.url.endsWith("/lista")).length, 3);
  assert.equal(esperas.length, 2);
  assert.ok(esperas[0]! >= 800 && esperas[0]! <= 1200, `1ª espera ~1 s, foi ${esperas[0]}`);
  assert.equal(esperas[1], 7000, "Retry-After em segundos");
});

test("status não retentável falha na hora; esgotar tentativas devolve o último erro", async () => {
  const { cliente, chamadas } = ambiente({ ...ROBOTS_LIVRE, "https://fonte.test/sumiu": status(404), "https://fonte.test/caiu": [status(502)] }, { intervaloMinimoMs: 0 });
  await assert.rejects(cliente.texto("https://fonte.test/sumiu"), (e: unknown) => e instanceof ErroHttp && e.status === 404 && e.tentativas === 1);
  assert.equal(chamadas.filter((c) => c.url.endsWith("/sumiu")).length, 1);
  await assert.rejects(cliente.texto("https://fonte.test/caiu"), (e: unknown) => e instanceof ErroHttp && e.status === 502 && e.tentativas === 3);
});

test("timeout por tentativa e erro de rede são retentados", async () => {
  let tentativas = 0;
  const pendurado: Rota = (init) =>
    new Promise((_, rejeitar) => {
      tentativas++;
      init.signal?.addEventListener("abort", () => rejeitar(new DOMException("abortado", "AbortError")));
    });
  const lento = ambiente({ ...ROBOTS_LIVRE, "https://fonte.test/lento": pendurado }, { timeoutMs: 20, intervaloMinimoMs: 0, tentativas: 2 });
  await assert.rejects(lento.cliente.texto("https://fonte.test/lento"), (e: unknown) => e instanceof ErroHttp && e.motivo === "timeout");
  assert.equal(tentativas, 2);

  const quebrado = ambiente(
    { ...ROBOTS_LIVRE, "https://fonte.test/rede": [() => Promise.reject(new TypeError("fetch failed")), ok("voltou")] },
    { intervaloMinimoMs: 0 },
  );
  assert.equal(await quebrado.cliente.texto("https://fonte.test/rede"), "voltou");
});

test("intervalo mínimo entre requisições ao mesmo host e Crawl-delay", async () => {
  const { cliente, esperas } = ambiente(
    { ...ROBOTS_LIVRE, "https://fonte.test/1": ok("1"), "https://fonte.test/2": ok("2"), "https://outro.test/1": ok("o") },
    { intervaloMinimoMs: 1500 },
  );
  await cliente.texto("https://fonte.test/1");
  await cliente.texto("https://fonte.test/2");
  await cliente.texto("https://outro.test/1");
  // fonte.test: robots → /1 → /2 (duas esperas); outro.test: robots → /1 (uma espera, só do
  // próprio host: ele não herda a fila do primeiro).
  assert.deepEqual(esperas, [1500, 1500, 1500]);

  const lento = ambiente({ "https://lento.test/robots.txt": ok("User-agent: *\nCrawl-delay: 4\n"), "https://lento.test/1": ok("1"), "https://lento.test/2": ok("2") }, { intervaloMinimoMs: 1000 });
  await lento.cliente.texto("https://lento.test/1");
  await lento.cliente.texto("https://lento.test/2");
  assert.deepEqual(lento.esperas, [1000, 4000], "Crawl-delay alonga o intervalo depois de lido");
});

test("validação de conteúdo recusa sem retentar (ex.: página de desafio no lugar do CSV)", async () => {
  const { cliente, chamadas } = ambiente({ ...ROBOTS_LIVRE, "https://fonte.test/lista.csv": ok("<html>desafio</html>", { "content-type": "text/html" }) }, { intervaloMinimoMs: 0 });
  await assert.rejects(
    cliente.texto("https://fonte.test/lista.csv", { validar: (r) => (r.texto.startsWith("Lista de Im") ? null : "assinatura do CSV ausente") }),
    (e: unknown) => e instanceof ErroHttp && e.motivo === "conteudo" && /assinatura/.test(e.message),
  );
  assert.equal(chamadas.filter((c) => c.url.endsWith(".csv")).length, 1);
});

test("limite de tamanho e decodificação pelo charset", async () => {
  const grande = ambiente({ ...ROBOTS_LIVRE, "https://fonte.test/grande": ok("x".repeat(5000)) }, { tamanhoMaximoBytes: 1000, intervaloMinimoMs: 0 });
  await assert.rejects(grande.cliente.texto("https://fonte.test/grande"), (e: unknown) => e instanceof ErroHttp && e.motivo === "tamanho");

  const latin = ambiente(
    { ...ROBOTS_LIVRE, "https://fonte.test/cp": () => new Response(new Uint8Array([0x49, 0x6d, 0xf3, 0x76, 0x65, 0x6c, 0x20, 0x96, 0x20, 0x4e, 0xe3, 0x6f]), { headers: { "content-type": "text/csv; charset=ISO-8859-1" } }) },
    { intervaloMinimoMs: 0 },
  );
  assert.equal(await latin.cliente.texto("https://fonte.test/cp"), "Imóvel – Não");
});

test("json(), verificar() e cancelamento", async () => {
  const { cliente, chamadas } = ambiente(
    {
      ...ROBOTS_LIVRE,
      "https://fonte.test/api": (init) => new Response(JSON.stringify({ metodo: init.method, corpo: init.body }), { headers: { "content-type": "application/json" } }),
      "https://fonte.test/quebrado": ok("<html>"),
      "https://fonte.test/foto.jpg": status(200),
    },
    { intervaloMinimoMs: 0 },
  );
  assert.deepEqual(await cliente.json("https://fonte.test/api", { corpo: '{"a":1}' }), { metodo: "POST", corpo: '{"a":1}' });
  assert.equal(chamadas.at(-1)?.cabecalhos["content-type"], "application/json");
  await assert.rejects(cliente.json("https://fonte.test/quebrado"), (e: unknown) => e instanceof ErroHttp && e.motivo === "conteudo");
  assert.equal(await cliente.verificar("https://fonte.test/foto.jpg"), 200);
  assert.equal(await cliente.verificar("https://fonte.test/nao-existe.jpg"), 404);
  assert.equal(chamadas.at(-1)?.metodo, "HEAD");

  const controle = new AbortController();
  controle.abort();
  await assert.rejects(cliente.texto("https://fonte.test/api", { sinal: controle.signal }), (e: unknown) => e instanceof ErroHttp && e.motivo === "cancelado");
  await assert.rejects(cliente.texto("ftp://fonte.test/x"), (e: unknown) => e instanceof ErroHttp && e.motivo === "url");
});

test("Retry-After em segundos e em data HTTP", () => {
  assert.equal(lerRetryAfter("120", 0), 120_000);
  assert.equal(lerRetryAfter("Wed, 21 Oct 2026 07:28:00 GMT", Date.parse("Wed, 21 Oct 2026 07:27:00 GMT")), 60_000);
  assert.equal(lerRetryAfter("lixo", 0), null);
  assert.equal(lerRetryAfter(null, 0), null);
});

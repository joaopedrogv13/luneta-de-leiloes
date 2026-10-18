/**
 * baixar-fichas.ts: prioridade (data de praça, depois modalidade), retomada (pula o HTML válido que já está na pasta),
 * regravação do fichas.json a partir de TODOS os HTML da pasta (fixtures reais), gravação periódica, parada por
 * bloqueio, por falhas seguidas e por Ctrl+C, e as falhas definitivas guardadas para a próxima vez. Sem rede: fetch falso.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { criarClienteHttp } from "../../util/http.ts";
import { lerArquivoFichas, lidaEmDaFicha } from "./aplicar-fichas.ts";
import {
  AVISO_DA_CONFERENCIA,
  baixarFichas,
  carregarPasta,
  cerca,
  criarParada,
  falhasRecentes,
  formatarDuracao,
  idsDaLista,
  idsDoPedido,
  lerFalhas,
  lerInstantaneo,
  lerResumoAnterior,
  ordenarPorPrioridade,
  PAUSA_DEPOIS_DO_BLOQUEIO_MS,
  pausaDoBloqueio,
  planejar,
  regravarFichasJson,
  substituir,
  urlFichaCaixa,
  type ItemFicha,
  type Parada,
} from "./baixar-fichas.ts";

const FIXTURES = join(import.meta.dirname, "fixtures");
const ID_2026 = "0000010005120";
const ID_2023 = "1444410505954";
const HTML_2026 = readFileSync(join(FIXTURES, `ficha_${ID_2026}_2026-10-08.html`));
const HTML_2023 = readFileSync(join(FIXTURES, `ficha_${ID_2023}_2023-12.html`));
const DESAFIO = "<html><head><script src='https://validate.perfdrive.com/x.js'></script></head><body>Verificando</body></html>";
const AGORA = new Date("2026-10-18T12:00:00Z");

const pasta = () => mkdtempSync(join(tmpdir(), "luneta-fichas-"));
const item = (id13: string, sobrepor: Partial<ItemFicha> = {}): ItemFicha => ({ id13, uf: "RJ", dataPraca: null, modalidade: "venda_direta", ...sobrepor });

/** Cliente com fetch falso: robots.txt libera tudo; cada ficha responde o que `paginas` disser (ou 404). */
function cliente(paginas: (id: string, n: number) => { status?: number; corpo: string | Uint8Array }, aoBuscar?: (id: string) => void) {
  const pedidos: string[] = [];
  const http = criarClienteHttp({
    intervaloMinimoMs: 0,
    tentativas: 1,
    esperar: async () => undefined,
    fetch: (async (entrada: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(entrada));
      if (url.pathname === "/robots.txt") return new Response("User-agent: *\nAllow: /\n", { status: 200 });
      const id = url.searchParams.get("hdnimovel") ?? "";
      pedidos.push(id);
      aoBuscar?.(id);
      const r = paginas(id, pedidos.length);
      // como o fetch de verdade: cancelado no meio, rejeita
      if (init?.signal?.aborted) throw new DOMException("cancelado", "AbortError");
      return new Response(r.corpo, { status: r.status ?? 200, headers: { "content-type": "text/html; charset=utf-8" } });
    }) as typeof fetch,
  });
  return { http, pedidos };
}

/** A ficha de 2026 com o número de outro imóvel (para simular várias fichas válidas diferentes). */
function fichaDe(id13: string): string {
  // a ficha mostra "Número do imóvel: 000001000512-0" (12 dígitos, traço, dígito verificador)
  return HTML_2026.toString("utf8").split("000001000512-0").join(`${id13.slice(0, 12)}-${id13.slice(12)}`);
}

const silencio = () => undefined;

test("ordenarPorPrioridade: praça mais próxima primeiro, depois Leilão SFI, Licitação, Venda Online, Venda Direta; empate pela ordem", () => {
  const itens = [
    item("0000000000001", { modalidade: "venda_direta" }),
    item("0000000000002", { modalidade: "leilao", dataPraca: "2026-11-04T13:00:00.000Z" }),
    item("0000000000003", { modalidade: "venda_online" }),
    item("0000000000004", { modalidade: "leilao", dataPraca: "2026-10-19T19:00:00.000Z" }),
    item("0000000000005", { modalidade: "licitacao_aberta" }),
    item("0000000000006", { modalidade: "leilao" }),
    // praça de anteontem: já passou, vai para os demais (pela modalidade)
    item("0000000000007", { modalidade: "leilao", dataPraca: "2026-10-16T10:00:00.000Z" }),
    // praça de hoje cedo (dentro de 24 h) ainda conta como próxima
    item("0000000000008", { modalidade: "venda_online", dataPraca: "2026-10-18T09:00:00.000Z" }),
    item("0000000000009", { modalidade: null }),
    item("0000000000010", { modalidade: "venda_direta", dataPraca: "data ruim" }),
  ];
  assert.deepEqual(
    ordenarPorPrioridade(itens, AGORA).map((x) => Number(x.id13)),
    [8, 4, 2, 6, 7, 5, 3, 1, 10, 9],
  );
  assert.deepEqual(ordenarPorPrioridade([], AGORA), []);
});

test("lerInstantaneo e idsDoPedido: --todas por prioridade (e por UF), --uf na ordem do arquivo, --ids normalizados", () => {
  const colunas = {
    id: ["caixa-0000000000001", "lj-123", "caixa-0000000000002", "caixa-0000000000003", "caixa-0000000000004"],
    uf: ["RJ", "SP", "SP", "RJ", "RJ"],
    dataPraca: [null, "2026-10-20T10:00:00.000Z", null, "2026-10-25T10:00:00.000Z", null],
    modalidade: ["venda_direta", "leilao", "leilao", "leilao", "licitacao_aberta"],
  };
  const itens = lerInstantaneo(gzipSync(JSON.stringify({ formato: "luneta-catalogo", colunas })));
  assert.deepEqual(itens.map((x) => x.id13), ["0000000000001", "0000000000002", "0000000000003", "0000000000004"], "só os da Caixa");
  const de = () => itens;
  assert.deepEqual(idsDoPedido({ todas: true }, de, AGORA).map(Number), [3, 2, 4, 1]);
  assert.deepEqual(idsDoPedido({ todas: true, uf: "rj" }, de, AGORA).map(Number), [3, 4, 1]);
  // uso antigo: --uf sem --todas, na ordem do instantâneo, com quantidade e início
  assert.deepEqual(idsDoPedido({ uf: "RJ", quantidade: 2 }, de, AGORA).map(Number), [1, 3]);
  assert.deepEqual(idsDoPedido({ uf: "RJ", quantidade: 2, inicio: 1 }, de, AGORA).map(Number), [3, 4]);
  assert.deepEqual(idsDoPedido({ ids: "10005120, 1444410505954,10005120" }, () => assert.fail("não lê o instantâneo"), AGORA), [ID_2026, ID_2023]);
  assert.deepEqual(idsDoPedido({}, de, AGORA), []);
  assert.deepEqual(idsDaLista(" , 12345678901234,7"), ["0000000000007"], "mais de 13 dígitos não é id");
  assert.throws(() => lerInstantaneo(gzipSync(JSON.stringify({ colunas: {} }))), /colunas/);
});

test("planejar e falhasRecentes: pula o que está na pasta e a falha dos últimos 7 dias; o limite corta a fila", () => {
  const p = planejar(["1", "2", "3", "4", "5"], new Set(["2"]), new Set(["4"]), 2);
  assert.deepEqual(p, { fila: ["1", "3"], puladosNaPasta: 1, puladosPorFalha: 1, foraDoLimite: 1 });
  assert.deepEqual(planejar(["1", "2"], new Set(), new Set(), null).fila, ["1", "2"]);
  const f = falhasRecentes({ a: { motivo: "x", em: "2026-10-15T00:00:00Z" }, b: { motivo: "x", em: "2026-10-01T00:00:00Z" } }, AGORA);
  assert.deepEqual([...f], ["a"]);
});

test("formatarDuracao e cerca: minutos, horas e dias em português", () => {
  assert.equal(formatarDuracao(20), "menos de 1 min");
  assert.equal(formatarDuracao(600), "10 min");
  assert.equal(formatarDuracao(4020), "1 h 07 min");
  assert.equal(formatarDuracao(21226 * 2.5), "14 h 44 min");
  assert.equal(formatarDuracao(100_000), "1 dia 3 h");
  assert.equal(cerca(20), "menos de 1 min");
  assert.equal(cerca(600), "~10 min");
});

test("regravarFichasJson: junta TODOS os HTML válidos da pasta (fixtures reais), com a data de cada um; o resto fica de fora", async () => {
  const dir = pasta();
  try {
    copyFileSync(join(FIXTURES, `ficha_${ID_2026}_2026-10-08.html`), join(dir, `${ID_2026}.html`));
    copyFileSync(join(FIXTURES, `ficha_${ID_2023}_2023-12.html`), join(dir, `${ID_2023}.html`));
    writeFileSync(join(dir, "8444402395965.html"), DESAFIO); // desafio salvo por engano: não é ficha
    copyFileSync(join(FIXTURES, `ficha_${ID_2023}_2023-12.html`), join(dir, "1111111111111.html")); // ficha de outro imóvel
    writeFileSync(join(dir, "anotacoes.html"), "<p>não é ficha</p>");
    utimesSync(join(dir, `${ID_2026}.html`), new Date("2026-10-17T10:00:00Z"), new Date("2026-10-17T10:00:00Z"));
    utimesSync(join(dir, `${ID_2023}.html`), new Date("2026-10-18T22:30:00Z"), new Date("2026-10-18T22:30:00Z"));

    const r = await regravarFichasJson(dir);
    assert.equal(r.total, 2);
    assert.deepEqual(r.invalidos.map((x) => x.id).sort(), ["1111111111111", "8444402395965"]);
    assert.match(r.invalidos.find((x) => x.id === "1111111111111")!.motivo, /imóvel 1444410505954/);

    const texto = readFileSync(join(dir, "fichas.json"), "utf8");
    const arquivo = lerArquivoFichas(texto); // o formato que base:fichas aceita
    assert.deepEqual(Object.keys(arquivo.fichas), [ID_2026, ID_2023].sort());
    assert.equal(arquivo.total, 2);
    assert.equal(arquivo.lidas_em, "2026-10-17T10:00:00.000Z", "lidas_em é a leitura mais antiga");
    assert.equal(lidaEmDaFicha(arquivo, ID_2023), "2026-10-18T22:30:00.000Z");
    assert.equal(lidaEmDaFicha(arquivo, ID_2026), "2026-10-17T10:00:00.000Z");
    assert.equal(arquivo.fichas[ID_2026]!.numero_imovel, ID_2026);
    assert.ok(arquivo.fichas[ID_2026]!.matriculas.length > 0, "a ficha de 2026 tem matrícula");
    assert.ok(!texto.includes("<html") && !texto.includes("<div"), "nenhum HTML no fichas.json");
    // mesmo conteúdo, mesmos bytes (o branch não ganha versões iguais)
    await regravarFichasJson(dir);
    assert.equal(readFileSync(join(dir, "fichas.json"), "utf8"), texto);

    const vazio = pasta();
    assert.equal((await regravarFichasJson(vazio)).total, 0);
    assert.deepEqual(lerArquivoFichas(readFileSync(join(vazio, "fichas.json"), "utf8")).fichas, {});
    rmSync(vazio, { recursive: true, force: true });
    assert.equal((await carregarPasta(join(dir, "nao-existe"))).acervo.size, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("baixarFichas, retomada: o HTML válido que já está na pasta é pulado; o inválido é baixado de novo", async () => {
  const dir = pasta();
  try {
    writeFileSync(join(dir, `${ID_2026}.html`), HTML_2026);
    writeFileSync(join(dir, `${ID_2023}.html`), DESAFIO);
    writeFileSync(join(dir, `${ID_2023}.html.tmp`), "resto de uma gravação interrompida");
    const { http, pedidos } = cliente((id) => ({ corpo: id === ID_2023 ? HTML_2023 : fichaDe(id) }));
    const linhas: string[] = [];
    const r = await baixarFichas({ ids: [ID_2026, ID_2023, "0000099999999"], saida: dir, http, log: (l) => linhas.push(l), agora: () => AGORA });
    assert.deepEqual(pedidos, [ID_2023, "0000099999999"], "a ficha válida da pasta não é pedida de novo");
    assert.equal(r.puladosNaPasta, 1);
    assert.deepEqual(r.ok, [ID_2023, "0000099999999"]);
    assert.equal(r.naPasta, 3);
    assert.equal(r.parada, "fim");
    assert.ok(!existsSync(join(dir, `${ID_2023}.html.tmp`)), "temporário velho apagado");
    assert.equal(readFileSync(join(dir, `${ID_2023}.html`)).length, HTML_2023.length, "o HTML bom substituiu o desafio");
    const arquivo = lerArquivoFichas(readFileSync(join(dir, "fichas.json"), "utf8"));
    assert.deepEqual(Object.keys(arquivo.fichas).sort(), ["0000099999999", ID_2026, ID_2023].sort());
    assert.equal(lidaEmDaFicha(arquivo, ID_2023), AGORA.toISOString());
    assert.ok(linhas.some((l) => /^\[1\/2 · 50,0% · faltam .+\] 1444410505954: ok · matrícula/.test(l)), linhas.join("\n"));
    const resumo = JSON.parse(readFileSync(join(dir, "resumo.json"), "utf8"));
    assert.deepEqual(resumo.ok, [ID_2023, "0000099999999"]);

    // segunda vez: tudo na pasta, nada é pedido
    const outra = cliente(() => assert.fail("não devia buscar"));
    const r2 = await baixarFichas({ ids: [ID_2026, ID_2023, "0000099999999"], saida: dir, http: outra.http, log: silencio });
    assert.equal(r2.fila, 0);
    assert.equal(r2.puladosNaPasta, 3);
    assert.equal(r2.naPasta, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("baixarFichas: fichas.json regravado no meio da coleta (a cada N), para uma interrupção não perder nada", async () => {
  const dir = pasta();
  try {
    const vistos: number[] = [];
    const { http } = cliente(
      (id) => ({ corpo: fichaDe(id) }),
      () => {
        const caminho = join(dir, "fichas.json");
        vistos.push(existsSync(caminho) ? Object.keys(JSON.parse(readFileSync(caminho, "utf8")).fichas).length : -1);
      },
    );
    const ids = ["0000000000011", "0000000000012", "0000000000013", "0000000000014", "0000000000015"];
    await baixarFichas({ ids, saida: dir, http, log: silencio, regravarACada: 2 });
    assert.deepEqual(vistos, [-1, -1, 2, 2, 4], "antes da 3ª ficha o arquivo já tinha as 2 primeiras");
    assert.equal(Object.keys(JSON.parse(readFileSync(join(dir, "fichas.json"), "utf8")).fichas).length, 5);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("baixarFichas: 5 bloqueios seguidos (desafio anti-robô, 403) param tudo; o desafio nunca é gravado", async () => {
  const dir = pasta();
  try {
    const { http, pedidos } = cliente((_id, n) => (n % 2 ? { corpo: DESAFIO } : { status: 403, corpo: "proibido" }));
    const linhas: string[] = [];
    const ids = Array.from({ length: 9 }, (_, i) => String(i + 1).padStart(13, "0"));
    const r = await baixarFichas({ ids, saida: dir, http, log: (l) => linhas.push(l) });
    assert.equal(r.parada, "bloqueio");
    assert.equal(pedidos.length, 5);
    assert.equal(r.bloqueio.length, 5);
    assert.match(r.bloqueio[0]!.motivo, /anti-robô/);
    assert.ok(linhas.some((l) => /BLOQUEIO/.test(l)));
    assert.ok(linhas.some((l) => /PARADA: 5 bloqueios seguidos/.test(l)));
    assert.equal((await carregarPasta(dir)).acervo.size, 0);
    assert.deepEqual(await lerFalhas(dir), {}, "bloqueio não vira falha guardada");

    // uma ficha boa no meio zera a contagem
    const dir2 = pasta();
    const c2 = cliente((id, n) => (n === 4 ? { corpo: fichaDe(id) } : { corpo: DESAFIO }));
    const r2 = await baixarFichas({ ids: [...ids, "0000000000010", "0000000000011"], saida: dir2, http: c2.http, log: silencio });
    assert.equal(r2.parada, "bloqueio");
    assert.equal(c2.pedidos.length, 9, "3 bloqueios, 1 ok, mais 5 bloqueios");
    assert.equal(r2.ok.length, 1);
    rmSync(dir2, { recursive: true, force: true });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("baixarFichas: falha definitiva (página sem ficha, 404) fica em falhas.json e é pulada por 7 dias; rede não fica", async () => {
  const dir = pasta();
  try {
    const ids = ["0000000000021", "0000000000022", "0000000000023", "0000000000024"];
    const { http } = cliente((id) => {
      if (id.endsWith("21")) return { corpo: "<html><body>Imóvel não encontrado</body></html>" };
      if (id.endsWith("22")) return { status: 404, corpo: "não achei" };
      if (id.endsWith("23")) return { status: 500, corpo: "erro" };
      return { corpo: fichaDe(id) };
    });
    const r = await baixarFichas({ ids, saida: dir, http, log: silencio, agora: () => AGORA });
    assert.equal(r.falha.length, 3);
    assert.deepEqual(Object.keys(await lerFalhas(dir)).sort(), ["0000000000021", "0000000000022"]);
    // o que falta de verdade: a de erro de servidor (tentada de novo) e as duas guardadas por 7 dias
    assert.deepEqual([r.restantes, r.comFalhaGuardada], [1, 2]);

    const depois = new Date(AGORA.getTime() + 24 * 3600 * 1000);
    const c2 = cliente((id) => ({ corpo: fichaDe(id) }));
    const r2 = await baixarFichas({ ids, saida: dir, http: c2.http, log: silencio, agora: () => depois });
    assert.deepEqual(c2.pedidos, ["0000000000023"], "só a de erro de servidor é tentada de novo");
    assert.equal(r2.puladosPorFalha, 2);
    assert.deepEqual([r2.restantes, r2.comFalhaGuardada], [0, 2], "nada a tentar até a pausa das falhas passar");
    assert.deepEqual(JSON.parse(readFileSync(join(dir, "resumo.json"), "utf8")).comFalhaGuardada, 2);

    const c3 = cliente((id) => ({ corpo: fichaDe(id) }));
    const r3 = await baixarFichas({ ids, saida: dir, http: c3.http, log: silencio, agora: () => depois, refazerFalhas: true });
    assert.deepEqual(c3.pedidos, ["0000000000021", "0000000000022"]);
    assert.equal(r3.naPasta, 4);
    assert.deepEqual(await lerFalhas(dir), {}, "a falha sai de falhas.json quando a ficha vem");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("baixarFichas: 25 falhas seguidas param, e essas não ficam marcadas (a página pode ter mudado)", async () => {
  const dir = pasta();
  try {
    const { http, pedidos } = cliente(() => ({ corpo: "<html><body>layout novo</body></html>" }));
    const ids = Array.from({ length: 40 }, (_, i) => String(i + 100).padStart(13, "0"));
    const r = await baixarFichas({ ids, saida: dir, http, log: silencio });
    assert.equal(r.parada, "falhas");
    assert.equal(pedidos.length, 25);
    assert.deepEqual(await lerFalhas(dir), {});
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("baixarFichas, Ctrl+C: a parada cancela a ficha em andamento e grava o fichas.json com o que já veio", async () => {
  const dir = pasta();
  try {
    const parada: Parada = criarParada();
    const { http, pedidos } = cliente((id, n) => {
      if (n === 2) parada.pedir(); // Ctrl+C enquanto a 2ª ficha baixa
      return { corpo: fichaDe(id) };
    });
    const ids = ["0000000000031", "0000000000032", "0000000000033"];
    const r = await baixarFichas({ ids, saida: dir, http, parada, log: silencio });
    assert.equal(r.parada, "interrompido");
    assert.deepEqual(r.ok, ["0000000000031"]);
    assert.ok(pedidos.length <= 2);
    const arquivo = lerArquivoFichas(readFileSync(join(dir, "fichas.json"), "utf8"));
    assert.deepEqual(Object.keys(arquivo.fichas), ["0000000000031"]);
    assert.equal(JSON.parse(readFileSync(join(dir, "resumo.json"), "utf8")).parada, "interrompido");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("baixarFichas, sem conexão: robots.txt sem rede ou falhas de rede seguidas param como sem_conexao (não é recusa)", async () => {
  const dir = pasta();
  try {
    const semRede = criarClienteHttp({
      intervaloMinimoMs: 0,
      tentativas: 1,
      esperar: async () => undefined,
      fetch: (async () => {
        throw Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("x"), { code: "ENOTFOUND" }) });
      }) as typeof fetch,
    });
    const linhas: string[] = [];
    const ids = Array.from({ length: 8 }, (_, i) => String(i + 1).padStart(13, "0"));
    const r = await baixarFichas({ ids, saida: dir, http: semRede, log: (l) => linhas.push(l), agora: () => AGORA });
    assert.equal(r.parada, "sem_conexao");
    assert.match(r.motivoDaParada!, /robots\.txt inacessível \(falha de rede: fetch failed \(ENOTFOUND\)/);
    assert.ok(linhas.some((l) => /SEM CONEXÃO ·/.test(l)), linhas.join("\n"));
    assert.ok(linhas.some((l) => /PARADA: o site da Caixa não abriu/.test(l)));
    assert.ok(!linhas.some((l) => /A Caixa está recusando/.test(l)), "não diz que a Caixa recusou");
    assert.equal(pausaDoBloqueio(await lerResumoAnterior(dir), AGORA), null, "sem conexão não pede pausa");

    // a internet cai no meio (o robots.txt já tinha aberto): 25 falhas de rede seguidas
    const dir2 = pasta();
    let n = 0;
    const caiu = criarClienteHttp({
      intervaloMinimoMs: 0,
      tentativas: 1,
      esperar: async () => undefined,
      fetch: (async (entrada: string | URL | Request) => {
        if (new URL(String(entrada)).pathname === "/robots.txt") return new Response("User-agent: *\nAllow: /\n");
        n++;
        throw new TypeError("fetch failed");
      }) as typeof fetch,
    });
    const muitos = Array.from({ length: 40 }, (_, i) => String(i + 1).padStart(13, "0"));
    const r2 = await baixarFichas({ ids: muitos, saida: dir2, http: caiu, log: silencio });
    assert.equal(r2.parada, "sem_conexao");
    assert.equal(n, 25);
    assert.deepEqual(await lerFalhas(dir2), {});
    rmSync(dir2, { recursive: true, force: true });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("pausaDoBloqueio: 2 h depois de uma recusa da Caixa, a próxima execução não pede fichas", async () => {
  const fim = "2026-10-18T12:00:00.000Z";
  const anterior = { parada: "bloqueio" as const, fim };
  const p = pausaDoBloqueio(anterior, new Date("2026-10-18T12:30:00Z"));
  assert.equal(p?.ate.toISOString(), new Date(Date.parse(fim) + PAUSA_DEPOIS_DO_BLOQUEIO_MS).toISOString());
  assert.equal(pausaDoBloqueio(anterior, new Date("2026-10-18T14:00:01Z")), null, "passou das 2 h");
  assert.equal(pausaDoBloqueio({ parada: "fim", fim }, new Date("2026-10-18T12:30:00Z")), null);
  assert.equal(pausaDoBloqueio({ parada: "sem_conexao", fim }, new Date("2026-10-18T12:30:00Z")), null);
  assert.equal(pausaDoBloqueio(anterior, new Date("2026-10-18T10:00:00Z")), null, "relógio do PC voltou: não prende");
  assert.equal(pausaDoBloqueio(null, new Date()), null);
  assert.equal(pausaDoBloqueio({ parada: "bloqueio", fim: "ontem" }, new Date()), null);

  // de ponta a ponta: o bloqueio grava o resumo que a pausa lê
  const dir = pasta();
  try {
    const { http } = cliente(() => ({ corpo: DESAFIO }));
    await baixarFichas({ ids: Array.from({ length: 6 }, (_, i) => String(i + 1).padStart(13, "0")), saida: dir, http, log: silencio, agora: () => AGORA });
    const resumo = await lerResumoAnterior(dir);
    assert.equal(resumo?.parada, "bloqueio");
    assert.match(resumo!.motivoDaParada!, /anti-robô/);
    assert.ok(pausaDoBloqueio(resumo, new Date(AGORA.getTime() + 60_000)));
    writeFileSync(join(dir, "resumo.json"), "{cortado");
    assert.equal(await lerResumoAnterior(dir), null, "resumo ilegível não prende");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("carregarPasta: avisa o progresso na conferência (21 mil fichas levam minutos) e um arquivo ilegível não derruba", async () => {
  const dir = pasta();
  try {
    for (let i = 1; i <= 5; i++) writeFileSync(join(dir, `${String(i).padStart(13, "0")}.html`), fichaDe(String(i).padStart(13, "0")));
    const avisos: string[] = [];
    // o aviso é a cada AVISO_DA_CONFERENCIA (2.000); com 5 arquivos, nenhum, e o fim não é avisado
    const r = await carregarPasta(dir, (feitos, total) => avisos.push(`${feitos}/${total}`));
    assert.equal(r.acervo.size, 5);
    assert.deepEqual(avisos, []);
    assert.equal(AVISO_DA_CONFERENCIA, 2000);
    // substituir: grava de uma vez, por cima, e não deixa o .tmp
    await substituir(join(dir, "x.json"), "1");
    await substituir(join(dir, "x.json"), "2");
    assert.equal(readFileSync(join(dir, "x.json"), "utf8"), "2");
    assert.ok(!existsSync(join(dir, "x.json.tmp")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("urlFichaCaixa: a página detalhe-imovel.asp da Caixa", () => {
  assert.equal(urlFichaCaixa(ID_2023), "https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnimovel=1444410505954");
});

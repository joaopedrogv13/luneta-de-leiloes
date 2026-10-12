import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executarColeta } from "../../coleta.ts";
import type { Banco } from "../../db.ts";
import { prepararImovel } from "../../gravar.ts";
import { bancoEmMemoria, httpProibido } from "../../testes/apoio.ts";
import type { ImovelNormalizado, MetaColeta, OpcoesColeta } from "../../tipos.ts";
import { criarClienteHttp, type ClienteHttp } from "../../util/http.ts";
import { validarImovel } from "../../validar.ts";
import { obterConector } from "../index.ts";
import { cacheEmMemoria } from "./cache.ts";
import { interpretarFicha } from "./ficha.ts";
import {
  capitalizarEndereco,
  criarConectorCaixa,
  fichaAtual,
  idTreze,
  normalizarCaixa,
  type BrutoCaixa,
  type ConfigConectorCaixa,
} from "./index.ts";
import { decodificarLista } from "./lista.ts";

const FIXTURES = join(import.meta.dirname, "fixtures");
const CSV_30 = join(FIXTURES, "Lista_imoveis_30.csv");
const HTML_FICHA_2026 = readFileSync(join(FIXTURES, "ficha_0000010005120_2026-10-08.html"));
const AGORA = new Date("2026-10-09T12:00:00Z");
const T2 = new Date("2026-10-10T12:00:00Z");

/** Conector de teste: sem cache em disco, sem espera real, volume mínimo baixo para a fixture. */
const conector = (extra: ConfigConectorCaixa = {}) =>
  criarConectorCaixa({ cache: null, fichasLocais: null, verificarFotos: false, volumeMinimo: 10, agora: () => AGORA, esperar: async () => undefined, ...extra });

/** Roda só o `coletar` e guarda os brutos e os metadados informados. */
async function coletar(c: ReturnType<typeof criarConectorCaixa>, op: Partial<OpcoesColeta> = {}) {
  const metas: MetaColeta[] = [];
  const brutos: BrutoCaixa[] = [];
  for await (const b of c.coletar({ http: httpProibido(), informar: (m) => metas.push(m), log: () => undefined, ...op })) brutos.push(b);
  return { brutos, metas, avisos: metas.flatMap((m) => (m.aviso ? [m.aviso] : [])) };
}

const porId = (imoveis: ImovelNormalizado[], numero: string): ImovelNormalizado => {
  const achado = imoveis.find((i) => i.id_na_fonte === idTreze(numero));
  assert.ok(achado, `imóvel ${numero} na fixture`);
  return achado;
};

type Rota = (init: RequestInit) => Response;
interface Chamada {
  url: string;
  metodo: string;
  ua: string;
}

/** Cliente HTTP educado com fetch falso (sem rede), relógio e espera controlados. */
function http(rotas: Record<string, Rota>): { cliente: ClienteHttp; chamadas: Chamada[] } {
  const chamadas: Chamada[] = [];
  let relogio = 0;
  const cliente = criarClienteHttp({
    agora: () => relogio,
    esperar: async (ms) => {
      relogio += ms;
    },
    fetch: (async (entrada: string | URL | Request, init: RequestInit = {}) => {
      const url = String(entrada);
      const cabecalhos = (init.headers ?? {}) as Record<string, string>;
      chamadas.push({ url, metodo: init.method ?? "GET", ua: cabecalhos["user-agent"] ?? "" });
      const rota = rotas[url];
      return rota ? rota(init) : new Response("não encontrado", { status: 404 });
    }) as typeof fetch,
  });
  return { cliente, chamadas };
}
const resposta = (corpo: string | Uint8Array, tipo: string, status = 200): Rota => () => new Response(corpo, { status, headers: { "content-type": tipo } });
const ROBOTS = { "https://venda-imoveis.caixa.gov.br/robots.txt": resposta("User-agent: *\nDisallow: /sistema/venda-online/\n", "text/plain") };

// ---------------------------------------------------------------------------

test("idTreze: completa com zeros até 13 dígitos e recusa lixo", () => {
  assert.equal(idTreze("10005120"), "0000010005120");
  assert.equal(idTreze(" 1444420699441 "), "1444420699441");
  assert.equal(idTreze("3341"), "0000000003341");
  assert.throws(() => idTreze(""), /inválido/);
  assert.throws(() => idTreze("12345678901234"), /inválido/);
  assert.throws(() => idTreze("12A45"), /inválido/);
});

test("fixture CP1252 de 30 linhas: todos normalizam e passam na validação do núcleo", async () => {
  const c = conector();
  const { brutos, metas } = await coletar(c, { arquivo: CSV_30 });
  assert.equal(brutos.length, 30);
  assert.equal(metas[0]?.geradoEm, "2026-10-08");
  assert.equal(metas[0]?.origem, CSV_30);
  assert.equal(metas[0]?.totalNaFonte, 30);
  const imoveis = brutos.map((b) => normalizarCaixa(b));
  for (const i of imoveis) assert.deepEqual(validarImovel(i), [], i.id_na_fonte);
  assert.equal(new Set(imoveis.map((i) => i.id_na_fonte)).size, 30);
  assert.ok(imoveis.every((i) => i.judicial === false && i.comitente === "Caixa Econômica Federal" && i.ocupacao === null));
});

test("Venda Direta Online: oferta única, link da ficha, capa não verificada, campos do CSV", async () => {
  const imoveis = (await coletar(conector(), { arquivo: CSV_30 })).brutos.map(normalizarCaixa);
  const t = porId(imoveis, "10005120");
  assert.equal(t.id_na_fonte, "0000010005120");
  assert.equal(t.url, "https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnimovel=10005120");
  assert.equal(t.titulo, "Terreno 600 m²");
  assert.equal(t.tipo, "terreno");
  assert.equal(t.uf, "AC");
  assert.equal(t.cidade, "Cruzeiro do Sul");
  assert.equal(t.bairro, "Bairro Cohab");
  assert.equal(t.endereco, "Rua do Purus, N. S/N, Quarteirão 272, Lote 10");
  assert.equal(t.area_terreno, 600);
  assert.equal(t.area_total, null);
  assert.equal(t.preco, 50074.26);
  assert.equal(t.valor_avaliacao, 150000);
  assert.equal(t.modalidade, "venda_direta");
  assert.equal(t.modalidade_fonte, "Venda Direta Online");
  assert.equal(t.aceita_financiamento, false);
  assert.equal(t.praca_atual, 0);
  assert.deepEqual(t.pracas, [{ numero: 0, data: null, valor_minimo: 50074.26 }]);
  assert.deepEqual(t.fotos, [{ url: "https://venda-imoveis.caixa.gov.br/fotos/F000001000512021.jpg", ordem: 0, origem: "padrao_url", verificada_em: null, ok: null }]);
  assert.deepEqual(t.documentos, [], "sem ficha não há documento: a matrícula só entra quando a ficha a publica");
  assert.equal(t.extras?.desconto_fonte, 66.62);
  assert.equal(t.cep, null);

  const casa = porId(imoveis, "1444420699441");
  assert.equal(casa.titulo, "Casa 3 quartos");
  assert.equal(casa.aceita_financiamento, true);
  assert.equal(casa.area_privativa, 240);
  assert.equal(casa.endereco, "Avenida 17 de Novembro, N. Sn, Qd 27 Lt 18");

  assert.equal(porId(imoveis, "1555531272650").tipo, "terreno", "Gleba Urbana");
  assert.equal(porId(imoveis, "10151420").tipo, "rural", "Gleba");
  assert.equal(porId(imoveis, "10147353").titulo, "Loja 79,2 m²");
  assert.equal(porId(imoveis, "8444407100017").area_privativa, null, "0.01 m² é marcador");
});

test("Leilão SFI sem ficha: leilão extrajudicial sem praça conhecida; Venda Online e Licitação: oferta única", async () => {
  const imoveis = (await coletar(conector(), { arquivo: CSV_30 })).brutos.map(normalizarCaixa);
  const sfi = porId(imoveis, "1444419018304");
  assert.equal(sfi.modalidade, "leilao");
  assert.equal(sfi.judicial, false);
  assert.equal(sfi.modalidade_fonte, "Leilão SFI - Edital Único");
  assert.deepEqual(sfi.pracas, []);
  assert.equal(sfi.praca_atual, null, "o CSV não diz se é 1º ou 2º leilão");
  assert.equal(sfi.preco, 643740.15);
  assert.equal(sfi.extras?.desconto_fonte, 0, "a coluna Desconto vem 0 quando o preço passa da avaliação");
  // O núcleo calcula o deságio: negativo quando o preço passa da avaliação.
  assert.equal(prepararImovel(sfi, AGORA).linha.desconto_pct, -45.97);
  assert.equal(prepararImovel(porId(imoveis, "10005120"), AGORA).linha.desconto_pct, 66.62);

  const online = porId(imoveis, "8444411200837");
  assert.equal(online.modalidade, "venda_online");
  assert.equal(online.praca_atual, 0);
  const licitacao = porId(imoveis, "8444406779849");
  assert.equal(licitacao.modalidade, "licitacao_aberta");
  assert.deepEqual(licitacao.pracas, [{ numero: 0, data: null, valor_minimo: 63818.64 }]);
});

test("normalizar lança para linha quebrada (vira inválido no núcleo, não derruba a coleta)", async () => {
  const [bom] = (await coletar(conector(), { arquivo: CSV_30, limite: 1 })).brutos;
  assert.ok(bom);
  const com = (campos: Partial<BrutoCaixa["linha"]>, extra: Partial<BrutoCaixa> = {}): BrutoCaixa => ({ ...bom, ...extra, linha: { ...bom.linha, ...campos } });
  assert.throws(() => normalizarCaixa(com({ numero: "" })), /número do imóvel/);
  assert.throws(() => normalizarCaixa(com({ uf: "XX" })), /UF inválida/);
  assert.throws(() => normalizarCaixa(com({ preco: "" })), /preço inválido/);
  assert.throws(() => normalizarCaixa(com({ cidade: " " })), /cidade vazia/);
  assert.throws(() => normalizarCaixa(com({}, { problema: "13 colunas" })), /13 colunas/);
  const linkEstranho = normalizarCaixa(com({ link: "https://outro.site/x?hdnimovel=10005120" }));
  assert.equal(linkEstranho.url, "https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnimovel=10005120");
});

test("coleta completa da fixture grava no banco; segunda coleta igual não muda nada", async () => {
  const db = bancoEmMemoria();
  const c = conector();
  const r1 = await executarColeta(db, c, { arquivo: CSV_30, agora: AGORA, http: httpProibido() });
  assert.equal(r1.status, "sucesso");
  assert.equal(r1.novos, 30);
  assert.equal(r1.geradoEm, "2026-10-08");
  assert.equal(r1.completa, true);
  const contar = (sql: string): number => Number(db.prepare(sql).get()?.n);
  assert.equal(contar("SELECT count(*) AS n FROM imovel WHERE fonte_id = 'caixa_csv' AND status = 'ativo'"), 30);
  assert.equal(contar("SELECT count(*) AS n FROM imovel WHERE desconto_pct < 0"), 4, "SFI com preço acima da avaliação");
  assert.equal(contar("SELECT count(*) AS n FROM foto WHERE origem = 'padrao_url' AND ok IS NULL"), 30);
  assert.equal(db.prepare("SELECT publica_fotos AS f, informa_ocupacao AS o FROM fonte WHERE id = 'caixa_csv'").get()?.o, 0);
  const r2 = await executarColeta(db, c, { arquivo: CSV_30, agora: T2, http: httpProibido() });
  assert.equal(r2.status, "sucesso");
  assert.equal(r2.inalterados, 30);
  assert.equal(contar("SELECT count(*) AS n FROM preco_historico"), 30);
});

test("volume mínimo padrão (5.000) recusa a lista pequena sem --uf; com --uf passa e só toca a UF", async () => {
  const db = bancoEmMemoria();
  const padrao = criarConectorCaixa({ cache: null, agora: () => AGORA });
  const r = await executarColeta(db, padrao, { arquivo: CSV_30, agora: AGORA, http: httpProibido() });
  assert.equal(r.status, "invalida");
  assert.match(r.erro ?? "", /mínimo esperado para caixa_csv é 5000/);
  assert.equal(Number(db.prepare("SELECT count(*) AS n FROM imovel").get()?.n), 0, "nada gravado");
  const uf = await executarColeta(db, padrao, { arquivo: CSV_30, uf: "AC", agora: AGORA, http: httpProibido() });
  assert.equal(uf.status, "sucesso");
  assert.equal(uf.novos, 10);
  assert.equal(uf.descartados, 20);
});

test("lista truncada ou trocada por página de bloqueio não grava nada e não apaga o que havia", async () => {
  const dir = mkdtempSync(join(tmpdir(), "caixa-"));
  try {
    const db: Banco = bancoEmMemoria();
    const c = conector();
    await executarColeta(db, c, { arquivo: CSV_30, agora: AGORA, http: httpProibido() });
    const bytes = readFileSync(CSV_30);
    const truncado = join(dir, "truncado.csv");
    writeFileSync(truncado, bytes.subarray(0, bytes.length - 200));
    const r = await executarColeta(db, c, { arquivo: truncado, agora: T2, http: httpProibido() });
    assert.equal(r.status, "erro");
    assert.match(r.erro ?? "", /truncado/);
    const bloqueio = join(dir, "bloqueio.csv");
    writeFileSync(bloqueio, "<html><head><title>Radware Bot Manager Captcha</title></head><body>...</body></html>");
    const r2 = await executarColeta(db, c, { arquivo: bloqueio, agora: T2, http: httpProibido() });
    assert.equal(r2.status, "erro");
    assert.match(r2.erro ?? "", /anti-robô/);
    assert.equal(Number(db.prepare("SELECT count(*) AS n FROM imovel WHERE status = 'ativo'").get()?.n), 30);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("rede (fetch falso): baixa o CSV da UF com User-Agent identificado e robots.txt; recusa desafio anti-robô", async () => {
  const csvAc = readFileSync(CSV_30);
  const { cliente, chamadas } = http({ ...ROBOTS, "https://venda-imoveis.caixa.gov.br/listaweb/Lista_imoveis_AC.csv": resposta(csvAc, "text/csv") });
  const db = bancoEmMemoria();
  // O arquivo da UF não pode trazer outras UFs: a fixture tem AC, AL e AM, então é recusada.
  const r = await executarColeta(db, conector(), { uf: "AC", agora: AGORA, http: cliente });
  assert.equal(r.status, "erro");
  assert.match(r.erro ?? "", /linha\(s\) de outra UF/);
  assert.deepEqual(chamadas.map((c) => c.url), [
    "https://venda-imoveis.caixa.gov.br/robots.txt",
    "https://venda-imoveis.caixa.gov.br/listaweb/Lista_imoveis_AC.csv",
  ]);
  assert.ok(chamadas.every((c) => c.ua === "LunetaDeLeiloes/0.1 (+contato)"));

  const soAc = decodificarLista(csvAc).split("\n").filter((l) => !/;(AL|AM) ;/.test(l)).join("\n");
  const rede2 = http({ ...ROBOTS, "https://venda-imoveis.caixa.gov.br/listaweb/Lista_imoveis_AC.csv": resposta(soAc, "text/csv; charset=utf-8") });
  const ok = await executarColeta(db, conector(), { uf: "AC", agora: AGORA, http: rede2.cliente });
  assert.equal(ok.status, "sucesso");
  assert.equal(ok.novos, 10);
  assert.equal(ok.origem, "https://venda-imoveis.caixa.gov.br/listaweb/Lista_imoveis_AC.csv");

  const desafio = http({ ...ROBOTS, "https://venda-imoveis.caixa.gov.br/listaweb/Lista_imoveis_geral.csv": resposta("<html><script src='https://validate.perfdrive.com/a.js'></script></html>", "text/html") });
  const recusada = await executarColeta(db, conector(), { agora: T2, http: desafio.cliente });
  assert.equal(recusada.status, "erro");
  assert.match(recusada.erro ?? "", /Conteúdo recusado.*perfdrive/);
  assert.equal(Number(db.prepare("SELECT count(*) AS n FROM imovel WHERE status = 'ativo'").get()?.n), 10, "o que havia continua");
});

test("--detalhes com fichas locais: CEP, matrícula, cartório, documentos, fotos e pagamento da ficha", async () => {
  const dir = mkdtempSync(join(tmpdir(), "caixa-fichas-"));
  try {
    copyFileSync(join(FIXTURES, "ficha_0000010005120_2026-10-08.html"), join(dir, "0000010005120.html"));
    const c = conector({ fichasLocais: dir, maxFalhasSeguidas: 3 });
    const { brutos, avisos } = await coletar(c, { arquivo: CSV_30, detalhes: true });
    assert.equal(brutos.length, 30, "falha de ficha não derruba a lista");
    assert.ok(avisos.some((a) => /Fichas desligadas nesta coleta \(3 falhas seguidas\)/.test(a)), avisos.join(" | "));
    const t = normalizarCaixa(brutos[0] as BrutoCaixa);
    assert.deepEqual(validarImovel(t), []);
    assert.equal(t.cep, "69980000");
    assert.equal(t.matricula, "9740");
    assert.equal(t.cartorio, "1º Ofício de Registro de Imóveis de Cruzeiro do Sul/AC");
    assert.deepEqual(t.documentos.map((d) => d.tipo), ["matricula"]);
    assert.deepEqual(t.fotos, [{ url: "https://venda-imoveis.caixa.gov.br/fotos/F000001000512021.jpg", ordem: 0, origem: "ficha", verificada_em: null, ok: null }]);
    assert.equal(t.aceita_fgts, false);
    assert.equal(t.aceita_parcelamento, false);
    assert.equal(t.textos?.[0]?.origem, "ficha");
    assert.match(t.textos?.[0]?.texto ?? "", /Condomínio: Sob responsabilidade do comprador/);
    assert.equal(t.extras?.comarca, "CRUZEIRO DO SUL-AC");
    assert.equal(t.extras?.averbacao_leiloes_negativos, "Averbado");
    assert.equal(t.extras?.ficha_atual, true);
    assert.equal(t.ocupacao, null, "o \"Situação\" comentado nunca vira ocupação");
    const semFicha = normalizarCaixa(brutos[1] as BrutoCaixa);
    assert.equal(semFicha.cep, null);
    assert.equal(semFicha.fotos[0]?.origem, "padrao_url");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("--detalhes pela rede: ficha a cada 2 s no mínimo, bloqueio desliga as fichas sem derrubar a coleta", async () => {
  const esperas: number[] = [];
  const base = "https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnimovel=";
  const { cliente, chamadas } = http({
    ...ROBOTS,
    [`${base}10005120`]: resposta(HTML_FICHA_2026, "text/html"),
    [`${base}10005121`]: resposta(HTML_FICHA_2026, "text/html"),
    [`${base}1444420699441`]: resposta("<html><body>Radware Bot Manager: verifique que você é humano (captcha)</body></html>", "text/html"),
  });
  const c = conector({ intervaloFichaMs: 2000, esperar: async (ms) => void esperas.push(ms) });
  const { brutos, avisos } = await coletar(c, { arquivo: CSV_30, detalhes: true, http: cliente });
  assert.equal(brutos.length, 30);
  const fichas = chamadas.filter((ch) => ch.url.startsWith(base)).map((ch) => ch.url.slice(base.length));
  assert.deepEqual(fichas, ["10005120", "10005121", "1444420699441"], "depois do bloqueio nenhuma ficha é pedida");
  assert.equal(esperas.length, 2);
  assert.ok(esperas.every((ms) => ms > 1900 && ms <= 2000), `esperas: ${esperas.join(", ")}`);
  assert.ok(avisos.some((a) => /Ficha 10005121: a ficha devolvida é de outro imóvel/.test(a)), avisos.join(" | "));
  assert.ok(avisos.some((a) => /Fichas desligadas nesta coleta \(bloqueio\)/.test(a)), avisos.join(" | "));
  assert.equal(normalizarCaixa(brutos[0] as BrutoCaixa).matricula, "9740");
});

test("cache: a coleta só de CSV mantém o que veio da ficha; mudança de preço invalida a parte volátil", async () => {
  const dir = mkdtempSync(join(tmpdir(), "caixa-cache-"));
  try {
    const fichas = join(dir, "fichas");
    const cache = join(dir, "detalhes.db");
    mkdirSync(fichas);
    copyFileSync(join(FIXTURES, "ficha_0000010005120_2026-10-08.html"), join(fichas, "0000010005120.html"));
    const db = bancoEmMemoria();
    const r1 = await executarColeta(db, conector({ cache, fichasLocais: fichas }), { arquivo: CSV_30, detalhes: true, limite: 1, agora: AGORA, http: httpProibido() });
    assert.equal(r1.status, "sucesso");
    const linha = () => db.prepare("SELECT cep, matricula, cartorio, textos, aceita_fgts, preco FROM imovel WHERE id_na_fonte = '0000010005120'").get();
    const docs = () => db.prepare("SELECT tipo FROM documento").all().map((d) => d.tipo);
    assert.equal(linha()?.matricula, "9740");

    // Coleta diária, só CSV, sem ficha nenhuma disponível: nada do que veio da ficha se perde.
    const r2 = await executarColeta(db, conector({ cache }), { arquivo: CSV_30, agora: T2, http: httpProibido() });
    assert.equal(r2.status, "sucesso");
    assert.equal(r2.novos, 29);
    assert.equal(linha()?.cep, "69980000");
    assert.equal(linha()?.cartorio, "1º Ofício de Registro de Imóveis de Cruzeiro do Sul/AC");
    assert.equal(linha()?.aceita_fgts, 0);
    assert.deepEqual(docs(), ["matricula"]);

    // O preço mudou no CSV: matrícula, CEP e cartório continuam; pagamento e textos da ficha saem até reler.
    const novoCsv = join(dir, "lista.csv");
    writeFileSync(novoCsv, decodificarLista(readFileSync(CSV_30)).replace("08/10/2026", "09/10/2026").replace(" 10005120 ;AC ;CRUZEIRO DO SUL ;BAIRRO COHAB ;RUA DO PURUS, N. S/N, QUARTEIRÃO 272, LOTE 10 ;50.074,26", " 10005120 ;AC ;CRUZEIRO DO SUL ;BAIRRO COHAB ;RUA DO PURUS, N. S/N, QUARTEIRÃO 272, LOTE 10 ;45.000,00"));
    const r3 = await executarColeta(db, conector({ cache }), { arquivo: novoCsv, agora: T2, http: httpProibido() });
    assert.equal(r3.atualizados, 1);
    assert.equal(linha()?.preco, 45000);
    assert.equal(linha()?.matricula, "9740");
    assert.equal(linha()?.cep, "69980000");
    assert.equal(linha()?.aceita_fgts, null);
    assert.equal(linha()?.textos, null);
    assert.deepEqual(docs(), ["matricula"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("fichaAtual: CSV igual ao da leitura, ou valores da ficha batendo com o CSV", () => {
  const ficha = interpretarFicha(HTML_FICHA_2026.toString("utf8"));
  const base = { preco: 50074.26, avaliacao: 150000, modalidade: "Venda Direta Online" };
  const detalhe = { ficha, ficha_em: AGORA.toISOString(), versao_parser: 1, base, falha_em: null, falha: null, fotos: null, fotos_em: null };
  assert.equal(fichaAtual(detalhe, base), true);
  assert.equal(fichaAtual({ ...detalhe, base: null }, base), true, "sem base guardada, vale o valor da ficha");
  assert.equal(fichaAtual(detalhe, { ...base, preco: 45000 }), false);
  assert.equal(fichaAtual(detalhe, { ...base, modalidade: "Venda Online" }), false);
  assert.equal(fichaAtual(null, base), false);
});

test("verificação de fotos (HEAD): slots até o primeiro 404; capa ausente fica com ok=false; HTML no lugar da foto desliga", async () => {
  const f = (id: string, slot: number) => `https://venda-imoveis.caixa.gov.br/fotos/F${id}${slot}.jpg`;
  const jpg = resposta("", "image/jpeg");
  const { cliente, chamadas } = http({
    ...ROBOTS,
    [f("0000010005120", 21)]: jpg,
    [f("0000010005120", 22)]: jpg,
    // 0000010005121: capa 404 (rota ausente)
    [f("1444420699441", 21)]: resposta("<html>desafio</html>", "text/html"),
  });
  const c = conector({ verificarFotos: true, maxSlotsFotos: 4 });
  const { brutos, avisos } = await coletar(c, { arquivo: CSV_30, http: cliente });
  const [a, b, d] = brutos.slice(0, 3).map((x) => normalizarCaixa(x));
  assert.deepEqual(a?.fotos.map((x) => [x.url, x.ok]), [[f("0000010005120", 21), true], [f("0000010005120", 22), true]]);
  assert.ok(a?.fotos.every((x) => x.verificada_em === AGORA.toISOString() && x.origem === "padrao_url"));
  assert.deepEqual(b?.fotos.map((x) => x.ok), [false], "capa 404: registrada como ausente");
  assert.deepEqual(d?.fotos.map((x) => x.ok), [null], "verificação desligada: volta à capa não verificada");
  assert.ok(avisos.some((x) => /Verificação de fotos desligada/.test(x)));
  assert.ok(chamadas.filter((x) => x.url.includes("/fotos/")).every((x) => x.metodo === "HEAD"));
  assert.equal(chamadas.filter((x) => x.url.includes("/fotos/")).length, 3 + 1 + 1, "3 HEAD no 1º (21, 22, 23=404), 1 no 2º, 1 no 3º e para");
  for (const i of [a, b, d]) assert.deepEqual(validarImovel(i as ImovelNormalizado), []);
});

test("cache em memória guarda e devolve cópias", () => {
  const cache = cacheEmMemoria();
  const ficha = interpretarFicha(HTML_FICHA_2026.toString("utf8"));
  cache.gravarFicha("0000010005120", ficha, { preco: 1, avaliacao: 2, modalidade: "x" }, AGORA);
  const lido = cache.ler("0000010005120");
  assert.equal(lido?.ficha?.cep, "69980000");
  if (lido?.ficha) lido.ficha.cep = "00000000";
  assert.equal(cache.ler("0000010005120")?.ficha?.cep, "69980000");
  assert.equal(cache.ler("0000000000001"), null);
});

test("endereço capitalizado sem estragar lotes e rodovias", () => {
  assert.equal(capitalizarEndereco("RODOVIA PE-07, N. S/N, Apto 301, BL 03"), "Rodovia PE-07, N. S/N, Apto 301, Bl 03");
  assert.equal(capitalizarEndereco("AVENIDA BRASIL, N. SN, Apto 202, BL 11 VG 547 LT 04C"), "Avenida Brasil, N. Sn, Apto 202, Bl 11 Vg 547 Lt 04C");
});

test("o conector está registrado como caixa_csv", () => {
  const registrado = obterConector("caixa_csv");
  assert.ok(registrado);
  assert.equal(registrado.capacidades.listaCompleta, true);
  assert.equal(registrado.capacidades.ocupacao, false);
  assert.equal(registrado.volumeMinimo, 5000);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { executarColeta } from "../../coleta.ts";
import type { Banco } from "../../db.ts";
import { prepararImovel } from "../../gravar.ts";
import { bancoEmMemoria, httpProibido } from "../../testes/apoio.ts";
import { UFS, type ImovelNormalizado, type MetaColeta, type OpcoesColeta } from "../../tipos.ts";
import { criarClienteHttp, type ClienteHttp, type OpcoesRequisicao } from "../../util/http.ts";
import { validarImovel } from "../../validar.ts";
import { obterConector } from "../index.ts";
import { abrirCacheDisco, cacheEmMemoria, caminhoCopia, ErroCache } from "./cache.ts";
import { interpretarFicha } from "./ficha.ts";
import {
  capitalizarEndereco,
  conferirLista,
  criarConectorCaixa,
  fichaAtual,
  idTreze,
  normalizarCaixa,
  type BrutoCaixa,
  type ConfigConectorCaixa,
} from "./index.ts";
import { decodificarLista, interpretarLista } from "./lista.ts";

const FIXTURES = join(import.meta.dirname, "fixtures");
const CSV_30 = join(FIXTURES, "Lista_imoveis_30.csv");
const HTML_FICHA_2026 = readFileSync(join(FIXTURES, "ficha_0000010005120_2026-10-08.html"));
const AGORA = new Date("2026-10-09T12:00:00Z");
const T2 = new Date("2026-10-10T12:00:00Z");
/** Mais de 7 dias depois de AGORA: a ficha guardada vence e é relida. */
const DEPOIS = new Date("2026-10-18T12:00:00Z");

/**
 * Conector de teste: sem cache em disco, sem espera real, volume mínimo baixo para a fixture e
 * sem a checagem da última UF (a fixture tem só AC, AL e AM; essa checagem tem testes próprios).
 */
const conector = (extra: ConfigConectorCaixa = {}) =>
  criarConectorCaixa({ cache: null, fichasLocais: null, verificarFotos: false, volumeMinimo: 10, ultimaUf: null, agora: () => AGORA, esperar: async () => undefined, ...extra });

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
  const padrao = criarConectorCaixa({ cache: null, ultimaUf: null, agora: () => AGORA });
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
    assert.equal(t.aceita_fgts, false, "a parte volátil da ficha vale: ela descreve a oferta do CSV");
    assert.ok(!("ficha_em" in (t.extras ?? {})) && !("ficha_atual" in (t.extras ?? {})), "data da leitura fica fora do imóvel (e do hash)");
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

// ---------------------------------------------------------------------------
// Revisão: LGPD no cache, ficha degradada, cache como ponto de falha, corte numa quebra de
// linha, hash estável, redirecionamento de foto, linha com ";" a mais e estimativa de tempo.
// ---------------------------------------------------------------------------

const TEXTO_FICHA = HTML_FICHA_2026.toString("utf8");
/** Ficha real de 2026 com dados pessoais fictícios na descrição (como numa ficha de Leilão SFI). */
const FICHA_COM_DADOS_PESSOAIS = TEXTO_FICHA.replace(
  "<strong>Descrição:</strong><br>.</p>",
  "<strong>Descrição:</strong><br>Casa. Imóvel com ação judicial movida por devedor fiduciante JOÃO CARLOS DA SILVA, CPF 529.982.247-25.</p>",
);
/** A mesma ficha sem matrícula, comarca, ofício, CEP e o link da matrícula (layout quebrado). */
const fichaDegradada = (html = TEXTO_FICHA): string =>
  html
    .replace(/<span>Matrícula\(s\):.*?<\/span>/, "")
    .replace(/<span>Comarca:.*?<\/span>/, "")
    .replace(/<span>Ofício:.*?<\/span>/, "")
    .replace("- CEP: 69980-000,", ",")
    .replace(/<span><a [^>]*ExibeDoc\('\/editais\/matricula[^)]*\)>Baixar matrícula do imóvel<\/a><\/span>/, "");
/** A ficha de 2026 com o número de outro imóvel (para servir de ficha a qualquer id13). */
const fichaDoImovel = (id13: string, html = TEXTO_FICHA): string =>
  html.replace("000001000512-0", `${id13.slice(0, 12)}-${id13.slice(12)}`).replace(/0000010005120/g, id13);
const IDS_AC = interpretarLista(decodificarLista(readFileSync(CSV_30))).registros
  .filter((r) => r.campos.uf === "AC")
  .map((r) => idTreze(r.campos.numero));

function pastaTemporaria(): { dir: string; fichas: string; cache: string; limpar: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "caixa-rev-"));
  const fichas = join(dir, "fichas");
  mkdirSync(fichas);
  return { dir, fichas, cache: join(dir, "detalhes.db"), limpar: () => rmSync(dir, { recursive: true, force: true }) };
}

test("LGPD: o cache de fichas (detalhes.db e a cópia .bak) não guarda nome nem CPF", async () => {
  const t = pastaTemporaria();
  try {
    writeFileSync(join(t.fichas, "0000010005120.html"), FICHA_COM_DADOS_PESSOAIS);
    const db = bancoEmMemoria();
    const r = await executarColeta(db, conector({ cache: t.cache, fichasLocais: t.fichas }), { arquivo: CSV_30, uf: "AC", detalhes: true, limite: 1, agora: AGORA, http: httpProibido() });
    assert.equal(r.status, "sucesso", r.erro ?? "");
    assert.match(String(db.prepare("SELECT textos FROM imovel WHERE id_na_fonte = '0000010005120'").get()?.textos), /devedor fiduciante \[NOME\], CPF \[CPF\]/);
    assert.ok(existsSync(caminhoCopia(t.cache)), "cópia de segurança gravada depois da coleta com fichas");
    for (const arquivo of [t.cache, caminhoCopia(t.cache)]) {
      const bruto = new DatabaseSync(arquivo);
      const linhas = JSON.stringify(bruto.prepare("SELECT * FROM detalhe").all());
      bruto.close();
      assert.match(linhas, /devedor fiduciante \[NOME\], CPF \[CPF\]/, arquivo);
      assert.doesNotMatch(linhas, /JOÃO|CARLOS DA SILVA|529\.982\.247-25/, arquivo);
      assert.doesNotMatch(readFileSync(arquivo).toString("utf8"), /CARLOS DA SILVA|529\.982\.247-25/, `bytes de ${arquivo}`);
    }
  } finally {
    t.limpar();
  }
});

test("LGPD: cache antigo (texto em claro) é mascarado ao abrir, sem sobra no arquivo, e a ficha é relida", () => {
  const t = pastaTemporaria();
  try {
    const ficha = interpretarFicha(TEXTO_FICHA);
    const emClaro = { ...ficha, descricao: "devedor fiduciante JOÃO CARLOS DA SILVA, CPF 529.982.247-25", texto: "Descrição: devedor fiduciante JOÃO CARLOS DA SILVA, CPF 529.982.247-25" };
    const velho = new DatabaseSync(t.cache);
    velho.exec(`CREATE TABLE detalhe (id13 TEXT PRIMARY KEY, ficha TEXT, ficha_em TEXT, versao_parser INTEGER, base TEXT, falha_em TEXT, falha TEXT, fotos TEXT, fotos_em TEXT)`);
    velho.prepare("INSERT INTO detalhe (id13, ficha, ficha_em, versao_parser) VALUES (?, ?, ?, 1)").run("0000010005120", JSON.stringify(emClaro), AGORA.toISOString());
    velho.close();
    assert.match(readFileSync(t.cache).toString("utf8"), /CARLOS DA SILVA/, "o arquivo antigo tinha o nome");
    const cache = abrirCacheDisco(t.cache);
    const lido = cache.ler("0000010005120");
    cache.fechar();
    assert.equal(lido?.ficha?.descricao, "devedor fiduciante [NOME], CPF [CPF]");
    assert.equal(lido?.versao_parser, 1, "versão antiga do parser: relida na próxima coleta com --detalhes");
    assert.doesNotMatch(readFileSync(t.cache).toString("utf8"), /CARLOS DA SILVA|529\.982\.247-25/);
  } finally {
    t.limpar();
  }
});

test("ficha degradada não apaga matrícula, CEP, cartório nem o PDF da matrícula; avisa", async () => {
  const t = pastaTemporaria();
  try {
    const arquivoFicha = join(t.fichas, "0000010005120.html");
    writeFileSync(arquivoFicha, TEXTO_FICHA);
    const db = bancoEmMemoria();
    const op = { arquivo: CSV_30, uf: "AC" as const, detalhes: true, limite: 1, http: httpProibido() };
    const r1 = await executarColeta(db, conector({ cache: t.cache, fichasLocais: t.fichas }), { ...op, agora: AGORA });
    assert.equal(r1.status, "sucesso");
    // Relida 9 dias depois, a ficha veio sem as linhas Matrícula/Comarca/Ofício, sem CEP e sem o PDF.
    writeFileSync(arquivoFicha, fichaDegradada());
    const r2 = await executarColeta(db, conector({ cache: t.cache, fichasLocais: t.fichas, agora: () => DEPOIS }), { ...op, agora: DEPOIS });
    assert.equal(r2.status, "sucesso");
    assert.ok(r2.avisos.some((a) => /Ficha 10005120: veio sem matrícula, comarca, ofício, CEP, PDF da matrícula; mantido o da leitura anterior/.test(a)), r2.avisos.join(" | "));
    assert.ok(r2.avisos.some((a) => /1 degradada/.test(a)));
    const linha = db.prepare("SELECT matricula, cep, cartorio FROM imovel WHERE id_na_fonte = '0000010005120'").get();
    assert.deepEqual({ ...linha }, { matricula: "9740", cep: "69980000", cartorio: "1º Ofício de Registro de Imóveis de Cruzeiro do Sul/AC" });
    assert.deepEqual(db.prepare("SELECT url FROM documento").all().map((d) => d.url), ["https://venda-imoveis.caixa.gov.br/editais/matricula/AC/0000010005120.pdf"]);
  } finally {
    t.limpar();
  }
});

test("fichas degradadas seguidas desligam as fichas da coleta; ficha sem número é recusada", async () => {
  const t = pastaTemporaria();
  try {
    for (const id of IDS_AC) writeFileSync(join(t.fichas, `${id}.html`), fichaDegradada(fichaDoImovel(id)));
    const semNumero = IDS_AC[0] as string;
    writeFileSync(join(t.fichas, `${semNumero}.html`), fichaDoImovel(semNumero).replace(/<span>Número do imóvel:.*?<\/span>/, ""));
    const { avisos } = await coletar(conector({ fichasLocais: t.fichas, maxFichasDegradadas: 3 }), { arquivo: CSV_30, uf: "AC", detalhes: true });
    assert.ok(avisos.some((a) => /Ficha \d+: Ficha recusada: sem "Número do imóvel"/.test(a)), avisos.join(" | "));
    assert.ok(avisos.some((a) => /Fichas desligadas nesta coleta \(3 fichas degradadas seguidas: layout mudou\?\)/.test(a)), avisos.join(" | "));
    assert.ok(avisos.some((a) => /Fichas: 4 buscada\(s\), 1 falha\(s\), 3 degradada\(s\)/.test(a)), avisos.join(" | "));
  } finally {
    t.limpar();
  }
});

test("cache corrompido, ou apagado com a cópia ainda lá: erro claro, nada gravado, nada apagado", async () => {
  const t = pastaTemporaria();
  try {
    const db = bancoEmMemoria();
    await executarColeta(db, conector(), { arquivo: CSV_30, agora: AGORA, http: httpProibido() });
    writeFileSync(t.cache, randomBytes(5000));
    const r = await executarColeta(db, conector({ cache: t.cache }), { arquivo: CSV_30, agora: T2, http: httpProibido() });
    assert.equal(r.status, "erro");
    assert.equal(r.lidos, 0);
    assert.match(r.erro ?? "", /^Cache da Caixa ilegível em .*detalhes\.db \(.*file is not a database.*\)\. Nada foi gravado\./);
    assert.match(r.erro ?? "", /mova o arquivo e rode a coleta com --detalhes/);
    assert.match(r.erro ?? "", /Não use LUNETA_CAIXA_CACHE=off numa base que já tem dados de ficha/);
    writeFileSync(caminhoCopia(t.cache), "cópia");
    const comCopia = await executarColeta(db, conector({ cache: t.cache }), { arquivo: CSV_30, agora: T2, http: httpProibido() });
    assert.match(comCopia.erro ?? "", /restaure a cópia da última coleta que gravou fichas ou fotos \(mv .* && cp .*\.bak/);
    rmSync(t.cache);
    const apagado = await executarColeta(db, conector({ cache: t.cache }), { arquivo: CSV_30, agora: T2, http: httpProibido() });
    assert.equal(apagado.status, "erro");
    assert.match(apagado.erro ?? "", /Cache da Caixa ausente em .*detalhes\.db, mas a cópia .*\.bak existe/);
    assert.throws(() => abrirCacheDisco(t.cache), ErroCache);
    assert.equal(Number(db.prepare("SELECT count(*) AS n FROM imovel WHERE status = 'ativo'").get()?.n), 30, "o que havia continua");
  } finally {
    t.limpar();
  }
});

test("cópia de segurança: depois da coleta com fichas, <cache>.bak restaurado devolve as fichas", async () => {
  const t = pastaTemporaria();
  try {
    copyFileSync(join(FIXTURES, "ficha_0000010005120_2026-10-08.html"), join(t.fichas, "0000010005120.html"));
    const db = bancoEmMemoria();
    await executarColeta(db, conector({ cache: t.cache, fichasLocais: t.fichas }), { arquivo: CSV_30, uf: "AC", detalhes: true, limite: 1, agora: AGORA, http: httpProibido() });
    writeFileSync(t.cache, randomBytes(5000));
    rmSync(`${t.cache}-wal`, { force: true });
    rmSync(`${t.cache}-shm`, { force: true });
    copyFileSync(caminhoCopia(t.cache), t.cache);
    const r = await executarColeta(db, conector({ cache: t.cache }), { arquivo: CSV_30, uf: "AC", agora: T2, http: httpProibido() });
    assert.equal(r.status, "sucesso", r.erro ?? "");
    assert.equal(db.prepare("SELECT matricula FROM imovel WHERE id_na_fonte = '0000010005120'").get()?.matricula, "9740");
  } finally {
    t.limpar();
  }
});

const CABECALHO_CSV = " N° do imóvel;UF;Cidade;Bairro;Endereço;Preço;Valor de avaliação;Desconto;Financiamento;Descrição;Modalidade de venda;Link de acesso";
/** Lista geral sintética, em ordem de UF como a real: `porUf` imóveis em cada UF. */
function listaSintetica(porUf: Record<string, number>, data = "08/10/2026"): string {
  const linhas = ["", ` Lista de Imóveis da Caixa;;Data de geração:;${data};;;;;;;`, CABECALHO_CSV, ""];
  let numero = 100000;
  for (const uf of Object.keys(porUf).sort()) {
    for (let i = 0; i < (porUf[uf] ?? 0); i++) {
      numero++;
      linhas.push(
        ` ${numero} ;${uf} ;CIDADE ${uf} ;CENTRO ;RUA A, N. ${i} ;100.000,00;200.000,00;50.00;Não;Casa, 0.00 de área total, 50.00 de área privativa, 0.00 de área do terreno.;Venda Direta Online;` +
          `https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnimovel=${numero}`,
      );
    }
  }
  return `${linhas.join("\r\n")}\r\n`;
}
const DUAS_POR_UF: Record<string, number> = Object.fromEntries(UFS.map((uf) => [uf, 2]));
const GERAL = "https://venda-imoveis.caixa.gov.br/listaweb/Lista_imoveis_geral.csv";

test("conferirLista: lista geral cortada numa quebra de linha (faltam as últimas UFs) é recusada", () => {
  const inteira = listaSintetica(DUAS_POR_UF);
  const ok = conferirLista(interpretarLista(inteira), { uf: null, ultimaUf: "TO", anterior: null, agora: AGORA });
  assert.deepEqual(ok.avisos, []);
  assert.equal(ok.resumo.total, 54);
  // Corte exato numa quebra de linha, a 60% do arquivo: passa nas checagens de estrutura...
  const corte = inteira.indexOf("\r\n", Math.floor(inteira.length * 0.6)) + 2;
  const cortada = interpretarLista(inteira.slice(0, corte));
  assert.ok(cortada.registros.length < 54);
  // ...mas termina antes de TO.
  assert.throws(
    () => conferirLista(cortada, { uf: null, ultimaUf: "TO", anterior: null, agora: AGORA }),
    /devia ir até TO, mas termina em (\w\w) \(faltam .*TO\)\. Arquivo cortado numa quebra de linha\? Nada foi gravado\. Se essas UFs saíram mesmo da lista, rode com LUNETA_CAIXA_ULTIMA_UF=\1/,
  );
  assert.deepEqual(conferirLista(cortada, { uf: null, ultimaUf: null, anterior: null, agora: AGORA }).avisos, [], "checagem desligada");
  assert.deepEqual(conferirLista(cortada, { uf: "AC", ultimaUf: null, anterior: null, agora: AGORA }).avisos, [], "lista de UF não tem essa checagem");
  // Fora de ordem de UF: não dá para saber onde cortou; avisa e não recusa.
  const foraDeOrdem = interpretarLista(inteira);
  foraDeOrdem.registros.reverse();
  assert.match(conferirLista(foraDeOrdem, { uf: null, ultimaUf: "TO", anterior: null, agora: AGORA }).avisos[0] ?? "", /não veio em ordem de UF/);
});

test("conferirLista: mesma data de geração com menos imóveis é recusada; data nova passa", () => {
  const anterior = { gerado_em: "2026-10-08", total: 54, por_uf: DUAS_POR_UF, registrada_em: AGORA.toISOString() };
  const menor = interpretarLista(listaSintetica({ ...DUAS_POR_UF, TO: 1 }));
  assert.throws(() => conferirLista(menor, { uf: null, ultimaUf: "TO", anterior, agora: T2 }), /mesma "Data de geração" \(2026-10-08\) da lista lida em 2026-10-09, mas com 53 imóveis em vez de 54/);
  const nova = interpretarLista(listaSintetica({ ...DUAS_POR_UF, TO: 1 }, "09/10/2026"));
  assert.equal(conferirLista(nova, { uf: null, ultimaUf: "TO", anterior, agora: T2 }).resumo.total, 53);
});

test("rede (fetch falso): CSV geral cortado numa quebra de linha não marca removidos; mesma data com menos linhas também não", async () => {
  const t = pastaTemporaria();
  try {
    const inteira = listaSintetica(DUAS_POR_UF);
    const servir = (corpo: string): ClienteHttp => http({ ...ROBOTS, [GERAL]: resposta(corpo, "text/csv") }).cliente;
    const c = conector({ cache: t.cache, ultimaUf: undefined });
    const db = bancoEmMemoria();
    const r1 = await executarColeta(db, c, { agora: AGORA, http: servir(inteira) });
    assert.equal(r1.status, "sucesso", r1.erro ?? "");
    assert.equal(r1.novos, 54);
    const corte = inteira.indexOf("\r\n", Math.floor(inteira.length * 0.6)) + 2;
    const r2 = await executarColeta(db, c, { agora: T2, http: servir(inteira.slice(0, corte)) });
    assert.equal(r2.status, "erro");
    assert.match(r2.erro ?? "", /devia ir até TO, mas termina em/);
    // Corte dentro da última UF: termina em TO, mas a mesma geração já foi lida com mais linhas.
    const semUltima = inteira.slice(0, inteira.lastIndexOf(" 100054 ;TO"));
    const r3 = await executarColeta(db, c, { agora: T2, http: servir(semUltima) });
    assert.equal(r3.status, "erro");
    assert.match(r3.erro ?? "", /mesma "Data de geração" \(2026-10-08\).*53 imóveis em vez de 54/);
    assert.equal(Number(db.prepare("SELECT count(*) AS n FROM imovel WHERE status = 'ativo'").get()?.n), 54, "nada marcado como removido");
    // Uma UF que saiu de verdade: com a última UF ajustada (LUNETA_CAIXA_ULTIMA_UF; aqui, pela
    // configuração) a lista passa, e a coleta seguinte já espera a última UF da lista anterior.
    const semTo = listaSintetica({ ...DUAS_POR_UF, TO: 0 }, "09/10/2026");
    const r4 = await executarColeta(db, conector({ cache: t.cache, ultimaUf: "SP" }), { agora: T2, http: servir(semTo) });
    assert.equal(r4.status, "sucesso", r4.erro ?? "");
    assert.equal(r4.removidos, 2);
    const r5 = await executarColeta(db, c, { agora: DEPOIS, http: servir(listaSintetica({ ...DUAS_POR_UF, TO: 0 }, "10/10/2026")) });
    assert.equal(r5.status, "sucesso", r5.erro ?? "");
  } finally {
    t.limpar();
  }
});

test("reler a mesma ficha dias depois não muda o imóvel (a data da leitura fica fora do hash)", async () => {
  const t = pastaTemporaria();
  try {
    copyFileSync(join(FIXTURES, "ficha_0000010005120_2026-10-08.html"), join(t.fichas, "0000010005120.html"));
    const db = bancoEmMemoria();
    const r1 = await executarColeta(db, conector({ cache: t.cache, fichasLocais: t.fichas }), { arquivo: CSV_30, uf: "AC", detalhes: true, agora: AGORA, http: httpProibido() });
    assert.equal(r1.novos, 10);
    const r2 = await executarColeta(db, conector({ cache: t.cache, fichasLocais: t.fichas, agora: () => DEPOIS }), { arquivo: CSV_30, uf: "AC", detalhes: true, agora: DEPOIS, http: httpProibido() });
    assert.ok(r2.avisos.some((a) => /^Fichas: 10 buscada\(s\)/.test(a)), "a ficha foi relida");
    assert.equal(r2.atualizados, 0);
    assert.equal(r2.inalterados, 10);
    const linha = db.prepare("SELECT atualizado_em, extras FROM imovel WHERE id_na_fonte = '0000010005120'").get();
    assert.equal(linha?.atualizado_em, AGORA.toISOString());
    assert.doesNotMatch(String(linha?.extras), /ficha_em|ficha_atual/);
  } finally {
    t.limpar();
  }
});

test("foto redirecionada (ex.: imagem padrão de \"sem foto\") não conta como confirmada", async () => {
  const capa = "https://venda-imoveis.caixa.gov.br/fotos/F000001000512021.jpg";
  const redirecionada: Rota = () => {
    const r = new Response(null, { status: 200, headers: { "content-type": "image/jpeg" } });
    Object.defineProperty(r, "url", { value: "https://venda-imoveis.caixa.gov.br/fotos/sem-foto.jpg" });
    return r;
  };
  const { cliente, chamadas } = http({ ...ROBOTS, [capa]: redirecionada });
  const { brutos, avisos } = await coletar(conector({ verificarFotos: true }), { arquivo: CSV_30, uf: "AC", limite: 1, http: cliente });
  const imovel = normalizarCaixa(brutos[0] as BrutoCaixa);
  assert.deepEqual(imovel.fotos.map((f) => [f.url, f.ok, f.verificada_em]), [[capa, null, AGORA.toISOString()]]);
  assert.ok(avisos.some((a) => /redirecionada para https:\/\/venda-imoveis\.caixa\.gov\.br\/fotos\/sem-foto\.jpg; slot não confirmado/.test(a)), avisos.join(" | "));
  assert.equal(chamadas.filter((c) => c.url.includes("/fotos/F0000010005120")).length, 1, "para no slot redirecionado");
});

test("linha com \";\" a mais no endereço é recuperada e não desliga a marcação de removidos", async () => {
  const db = bancoEmMemoria();
  await executarColeta(db, conector(), { arquivo: CSV_30, agora: AGORA, http: httpProibido() });
  const t = pastaTemporaria();
  try {
    const original = decodificarLista(readFileSync(CSV_30)).replace("08/10/2026", "09/10/2026");
    const semUma = original.split("\n").filter((l) => !l.startsWith(" 10005121 ;")).join("\n");
    const comPontoEVirgula = semUma.replace("RUA DO PURUS, N. S/N, QUARTEIRÃO 272, LOTE 10 ;", "RUA DO PURUS, N. S/N, QUARTEIRÃO 272, LOTE 10 ; FUNDOS ;");
    const arquivo = join(t.dir, "lista.csv");
    writeFileSync(arquivo, comPontoEVirgula);
    const r = await executarColeta(db, conector(), { arquivo, agora: T2, http: httpProibido() });
    assert.equal(r.status, "sucesso", `${r.erro ?? ""} ${r.avisos.join(" | ")}`);
    assert.equal(r.invalidos, 0);
    assert.equal(r.completa, true);
    assert.equal(r.removidos, 1);
    assert.ok(r.avisos.some((a) => /1 linha\(s\) com ";" a mais recuperada\(s\), excedente juntado a Endereço \(linha 5\)/.test(a)), r.avisos.join(" | "));
    assert.equal(db.prepare("SELECT endereco FROM imovel WHERE id_na_fonte = '0000010005120'").get()?.endereco, "Rua do Purus, N. S/N, Quarteirão 272, Lote 10 ; Fundos");

    // Sem âncora (link de outro número): continua inválida, mas o aviso de modalidade não lê a coluna deslocada.
    const quebrada = comPontoEVirgula.replace("hdnimovel=10005120\n", "hdnimovel=99\n").replace("09/10/2026", "10/10/2026");
    writeFileSync(arquivo, quebrada);
    const r2 = await executarColeta(db, conector(), { arquivo, agora: T2, http: httpProibido() });
    assert.equal(r2.invalidos, 1);
    assert.ok(r2.avisos.some((a) => /1 linha\(s\) com número de colunas diferente do cabeçalho e não recuperáveis \(linha 5\)/.test(a)), r2.avisos.join(" | "));
    assert.ok(r2.avisos.every((a) => !/Modalidade nova/.test(a)), r2.avisos.join(" | "));
  } finally {
    t.limpar();
  }
});

test("estimativa de tempo conta a ficha e 2 HEAD de foto por imóvel; o CSV tem timeout próprio", async () => {
  const logs: string[] = [];
  const timeouts: Array<[string, number | undefined]> = [];
  const { cliente } = http({ ...ROBOTS });
  const espiao: ClienteHttp = {
    ...cliente,
    requisitar: (url: string, opcoes?: OpcoesRequisicao) => {
      timeouts.push([url, opcoes?.timeoutMs]);
      return cliente.requisitar(url, opcoes);
    },
  };
  const { avisos } = await coletar(conector({ verificarFotos: true, maxFalhasSeguidas: 2 }), { arquivo: CSV_30, detalhes: true, http: espiao, log: (m) => logs.push(m) });
  assert.ok(logs.some((l) => /fichas e fotos ligadas para até 30 imóvel\(is\); sem nada no cache, ~0\.\d h \(3 requisição\(ões\) por imóvel, 2 s entre elas\)/.test(l)), logs.join(" | "));
  assert.ok(avisos.some((a) => /Verificação de fotos ligada na lista inteira, sem --uf nem --limite: pelo menos 2 HEAD por imóvel/.test(a)), avisos.join(" | "));

  timeouts.length = 0;
  await coletar(conector(), { uf: "AC", http: espiao }).catch(() => undefined);
  await coletar(conector(), { http: espiao }).catch(() => undefined);
  assert.deepEqual(timeouts, [
    ["https://venda-imoveis.caixa.gov.br/listaweb/Lista_imoveis_AC.csv", 120_000],
    [GERAL, 300_000],
  ]);
});

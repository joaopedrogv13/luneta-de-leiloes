import { test } from "node:test";
import assert from "node:assert/strict";
import { executarColeta } from "./coleta.ts";
import type { Banco } from "./db.ts";
import type { OpcoesColeta } from "./tipos.ts";
import { bancoEmMemoria, conectorFalso, httpProibido, imovelExemplo, lote } from "./testes/apoio.ts";

const T1 = new Date("2026-10-12T12:00:00Z");
const T2 = new Date("2026-10-13T12:00:00Z");

const contar = (db: Banco, sql: string): number => Number(db.prepare(sql).get()?.n);
const ultimaColeta = (db: Banco) => db.prepare("SELECT * FROM coleta ORDER BY id DESC LIMIT 1").get();

test("coleta completa grava, registra log com data de geração e passa as opções ao conector", async () => {
  const db = bancoEmMemoria();
  let recebidas: OpcoesColeta | undefined;
  const conector = conectorFalso({ registros: () => lote(5), geradoEm: "2026-10-08", espiar: (o) => (recebidas = o) });
  const r = await executarColeta(db, conector, { agora: T1, http: httpProibido(), arquivo: "/tmp/fixture.csv", detalhes: true });
  assert.equal(r.status, "sucesso");
  assert.equal(r.completa, true);
  assert.equal(r.novos, 5);
  assert.equal(r.geradoEm, "2026-10-08");
  assert.equal(recebidas?.arquivo, "/tmp/fixture.csv");
  assert.equal(recebidas?.detalhes, true);
  const c = ultimaColeta(db);
  assert.equal(c?.status, "sucesso");
  assert.equal(c?.gerado_na_fonte_em, "2026-10-08");
  assert.equal(c?.novos, 5);
  assert.equal(c?.terminada_em !== null, true);
  assert.equal(db.prepare("SELECT nome FROM fonte WHERE id = 'falso'").get()?.nome, "Fonte falsa de teste");
});

test("falha no meio da coleta não grava nada e não apaga o que já existia", async () => {
  const db = bancoEmMemoria();
  await executarColeta(db, conectorFalso({ registros: () => lote(5) }), { agora: T1, http: httpProibido() });
  const quebrado = conectorFalso({ registros: () => lote(5, () => ({ preco: 1 })), falharDepoisDe: 3 });
  const r = await executarColeta(db, quebrado, { agora: T2, http: httpProibido() });
  assert.equal(r.status, "erro");
  assert.match(r.erro ?? "", /conexão caiu/);
  assert.equal(contar(db, "SELECT count(*) AS n FROM imovel WHERE status = 'ativo'"), 5);
  assert.equal(contar(db, "SELECT count(*) AS n FROM imovel WHERE preco = 1"), 0, "nenhum preço novo foi gravado");
  assert.equal(ultimaColeta(db)?.status, "erro");
});

test("conteúdo reprovado: zero registros, muitos inválidos, volume mínimo, arquivo mais antigo", async () => {
  const db = bancoEmMemoria();
  const vazio = await executarColeta(db, conectorFalso({ registros: () => [] }), { agora: T1, http: httpProibido() });
  assert.equal(vazio.status, "invalida");

  const quebrados = lote(10, (i) => (i < 3 ? { uf: "XX" as never } : {}));
  const ruim = await executarColeta(db, conectorFalso({ registros: () => quebrados }), { agora: T1, http: httpProibido() });
  assert.equal(ruim.status, "invalida");
  assert.match(ruim.erro ?? "", /3 de 10 registros com erro/);
  assert.equal(contar(db, "SELECT count(*) AS n FROM imovel"), 0);

  const pouco = await executarColeta(db, conectorFalso({ registros: () => lote(5), volumeMinimo: 100 }), { agora: T1, http: httpProibido() });
  assert.equal(pouco.status, "invalida");
  assert.match(pouco.erro ?? "", /mínimo esperado/);

  await executarColeta(db, conectorFalso({ registros: () => lote(5), geradoEm: "2026-10-09" }), { agora: T1, http: httpProibido() });
  const antigo = await executarColeta(db, conectorFalso({ registros: () => lote(5, () => ({ preco: 1 })), geradoEm: "2026-10-08" }), { agora: T2, http: httpProibido() });
  assert.equal(antigo.status, "invalida");
  assert.match(antigo.erro ?? "", /mais antigo/);
  assert.equal(contar(db, "SELECT count(*) AS n FROM imovel WHERE preco = 1"), 0);
});

test("poucos inválidos: grava o resto como parcial e protege os ids inválidos da remoção", async () => {
  const db = bancoEmMemoria();
  await executarColeta(db, conectorFalso({ registros: () => lote(40) }), { agora: T1, http: httpProibido() });
  const comUmRuim = lote(40, (i) => (i === 0 ? { url: "nao-e-url" } : {}));
  const r = await executarColeta(db, conectorFalso({ registros: () => comUmRuim }), { agora: T2, http: httpProibido() });
  assert.equal(r.status, "parcial");
  assert.equal(r.invalidos, 1);
  assert.equal(r.removidos, 0, "o id 1 veio da fonte; não some por falha de validação");
  assert.match(r.avisos.join(" "), /url inválida/);
});

test("normalizar que lança desliga a remoção; descartados não contam como erro", async () => {
  const db = bancoEmMemoria();
  await executarColeta(db, conectorFalso({ registros: () => lote(30) }), { agora: T1, http: httpProibido() });
  const registros = [...lote(29), "quebrado", "veiculo"];
  const conector = conectorFalso({
    registros: () => registros,
    normalizar: (b) => {
      if (b === "quebrado") throw new Error("campo obrigatório ausente");
      if (b === "veiculo") return null;
      return b as ReturnType<typeof imovelExemplo>;
    },
  });
  const r = await executarColeta(db, conector, { agora: T2, http: httpProibido() });
  assert.equal(r.descartados, 1);
  assert.equal(r.invalidos, 1);
  assert.equal(r.completa, false);
  assert.equal(r.removidos, 0);
  assert.match(r.avisos.join(" "), /Remoção desligada/);
});

test("--limite e lista não completa nunca removem; --uf ignora outras UFs", async () => {
  const db = bancoEmMemoria();
  await executarColeta(db, conectorFalso({ registros: () => lote(10) }), { agora: T1, http: httpProibido() });
  const limitada = await executarColeta(db, conectorFalso({ registros: () => lote(10) }), { agora: T2, http: httpProibido(), limite: 3 });
  assert.equal(limitada.lidos, 3);
  assert.equal(limitada.completa, false);
  assert.equal(limitada.removidos, 0);

  const busca = await executarColeta(db, conectorFalso({ registros: () => lote(2), listaCompleta: false }), { agora: T2, http: httpProibido() });
  assert.equal(busca.completa, false);
  assert.equal(busca.removidos, 0);

  const mistos = [imovelExemplo({ id_na_fonte: "rj", uf: "RJ", cidade: "Niterói" }), ...lote(10)];
  const soRj = await executarColeta(db, conectorFalso({ registros: () => mistos }), { agora: T2, http: httpProibido(), uf: "RJ" });
  assert.equal(soRj.novos, 1);
  assert.equal(soRj.descartados, 10);
  assert.equal(soRj.removidos, 0, "remoção só no escopo RJ, onde nada sumiu");
  assert.equal(contar(db, "SELECT count(*) AS n FROM imovel WHERE status = 'ativo'"), 11);
});

test("cancelamento no meio não grava nada", async () => {
  const db = bancoEmMemoria();
  const controle = new AbortController();
  const conector = conectorFalso({ registros: () => lote(10) });
  const normalizar = conector.normalizar.bind(conector);
  conector.normalizar = (b) => {
    if ((b as { id_na_fonte: string }).id_na_fonte === "5") controle.abort();
    return normalizar(b);
  };
  const r = await executarColeta(db, conector, { agora: T1, http: httpProibido(), sinal: controle.signal });
  assert.equal(r.status, "erro");
  assert.match(r.erro ?? "", /cancelada/);
  assert.equal(contar(db, "SELECT count(*) AS n FROM imovel"), 0);
});

test("editais vão para a tabela do radar", async () => {
  const db = bancoEmMemoria();
  const edital = { registro: "edital", id_na_fonte: "e1", titulo: "Aviso de leilão", url: "https://exemplo.test/e1", uf: "SP", publicado_em: "2026-10-01" };
  const r = await executarColeta(db, conectorFalso({ registros: () => [edital], listaCompleta: false }), { agora: T1, http: httpProibido() });
  assert.equal(r.status, "sucesso");
  assert.equal(r.editais, 1);
  assert.equal(contar(db, "SELECT count(*) AS n FROM edital"), 1);
});

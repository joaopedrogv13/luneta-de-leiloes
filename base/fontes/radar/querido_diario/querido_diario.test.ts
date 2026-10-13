import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { principal } from "../../../cli.ts";
import { executarColeta } from "../../../coleta.ts";
import { abrirBanco } from "../../../db.ts";
import { bancoEmMemoria, httpProibido } from "../../../testes/apoio.ts";
import type { EditalNormalizado, MetaColeta, OpcoesColeta } from "../../../tipos.ts";
import type { ClienteHttp } from "../../../util/http.ts";
import { validarEdital } from "../../../validar.ts";
import { DIR_FIXTURES, httpFalso, respostaJson } from "../testes.ts";
import { criarConectorQueridoDiario, montarQuerystring, queridoDiario, type DiarioQd } from "./index.ts";

const FIXTURE = join(DIR_FIXTURES, "querido_diario", "gazettes.json");
const JANELA = { desde: "2026-10-07", ate: "2026-10-08" };

function opcoes(http: ClienteHttp, extra: Partial<OpcoesColeta> = {}): OpcoesColeta & { metas: MetaColeta[] } {
  const metas: MetaColeta[] = [];
  return { http, informar: (m) => metas.push(m), log: () => undefined, metas, ...extra };
}

async function coletarTudo(conector: ReturnType<typeof criarConectorQueridoDiario>, op: OpcoesColeta): Promise<DiarioQd[]> {
  const lista: DiarioQd[] = [];
  for await (const d of conector.coletar(op)) lista.push(d);
  return lista;
}

function diario(i: number, uf = "SP"): DiarioQd {
  return {
    territory_id: `35999${String(i).padStart(2, "0")}`,
    date: "2026-10-08",
    url: `https://data.queridodiario.ok.org.br/35999${String(i).padStart(2, "0")}/2026-10-08/arquivo${i}.pdf`,
    territory_name: `Cidade ${i}`,
    state_code: uf,
    excerpts: [`EDITAL DE LEILÃO Nº ${i}/2026. Leilão de terreno urbano em 20/11/2026.`],
  };
}

test("querystring padrão: leilão E um dos termos de imóvel pedidos", () => {
  assert.equal(
    montarQuerystring(),
    '(leilão | leilao) + (imóvel | imóveis | terreno | "lote urbano" | edificação | apartamento | casa | "sala comercial" | galpão | fazenda | gleba | área)',
  );
});

test("fixture: só o diário com leilão de imóvel vira edital, com cidade, UF, data do leilão e atribuição", async () => {
  const brutos = await coletarTudo(queridoDiario, opcoes(httpProibido(), { arquivo: FIXTURE }));
  assert.equal(brutos.length, 3);
  const editais = brutos.map((b) => queridoDiario.normalizar(b)).filter((e): e is EditalNormalizado => e !== null && e.registro === "edital");
  assert.equal(editais.length, 1, "veículos e concessão de uso ficam de fora");
  const [e] = editais;
  assert.ok(e);
  assert.deepEqual(validarEdital(e), []);
  assert.equal(e.id_na_fonte, "3599901/2026-10-08/5f2b0c9a1e7d4b3c8a6f0e1d2c3b4a5968778695");
  assert.equal(e.titulo, "Edital de leilão nº 002/2026 – Diário oficial de Vila Exemplo/SP, 08/10/2026 (edição 1.234)");
  assert.equal(e.uf, "SP");
  assert.equal(e.cidade, "Vila Exemplo");
  assert.equal(e.orgao, "Município de Vila Exemplo/SP");
  assert.equal(e.publicado_em, "2026-10-08");
  assert.equal(e.data_leilao, "2026-11-20T13:00:00.000Z");
  assert.equal(e.url, "https://data.queridodiario.ok.org.br/3599901/2026-10-08/5f2b0c9a1e7d4b3c8a6f0e1d2c3b4a5968778695.pdf");
  assert.match(e.resumo ?? "", /terreno urbano com área total de 300,00 m²/);
  assert.match(e.resumo ?? "", /Fonte: Querido Diário – Open Knowledge Brasil\.$/);
  const soPr = await coletarTudo(queridoDiario, opcoes(httpProibido(), { arquivo: FIXTURE, uf: "PR" }));
  assert.deepEqual(soPr.map((d) => d.territory_id), ["4199903"]);
});

test("normalizar recusa diário quebrado e descarta trecho sem leilão de imóvel", () => {
  assert.throws(() => queridoDiario.normalizar({ territory_id: "3599901", date: "2026-10-08" }), /sem url/);
  assert.equal(queridoDiario.normalizar({ ...diario(1), excerpts: ["Nomeação de servidor para a secretaria de obras."] }), null);
  assert.equal(queridoDiario.normalizar({ ...diario(1), excerpts: [] }), null);
});

test("rede: parâmetros da API, paginação por offset, municípios e filtro de UF", async () => {
  const total = 5;
  const todos = [diario(1), diario(2, "RJ"), diario(3), diario(4), diario(5)];
  const { http, pedidos } = httpFalso((url) => {
    const offset = Number(url.searchParams.get("offset"));
    const size = Number(url.searchParams.get("size"));
    return respostaJson({ total_gazettes: total, gazettes: todos.slice(offset, offset + size) });
  });
  const conector = criarConectorQueridoDiario({ janela: JANELA, tamanhoPagina: 2, ambiente: { LUNETA_QD_TERRITORIOS: "3599901,3599903" } });
  const op = opcoes(http, { uf: "SP" });
  const lidos = await coletarTudo(conector, op);
  assert.deepEqual(lidos.map((d) => d.territory_id), ["3599901", "3599903", "3599904", "3599905"]);
  assert.deepEqual(pedidos.map((p) => p.url.searchParams.get("offset")), ["0", "2", "4"]);
  const p = pedidos[0]?.url.searchParams;
  assert.equal(pedidos[0]?.url.origin + (pedidos[0]?.url.pathname ?? ""), "https://api.queridodiario.ok.org.br/gazettes");
  assert.equal(p?.get("querystring"), montarQuerystring());
  assert.equal(p?.get("published_since"), "2026-10-07");
  assert.equal(p?.get("published_until"), "2026-10-08");
  assert.deepEqual(p?.getAll("territory_ids"), ["3599901", "3599903"]);
  assert.equal(p?.get("excerpt_size"), "1500");
  assert.equal(p?.get("number_of_excerpts"), "3");
  assert.equal(p?.get("sort_by"), "descending_date");
  assert.ok(op.metas.some((m) => m.totalNaFonte === 5));
  assert.ok(pedidos.every((x) => !x.url.pathname.endsWith("/robots.txt")));
});

test("rede: trava de resultados avisa; resposta fora do formato e município inválido param a coleta", async () => {
  const { http } = httpFalso((url) => {
    const offset = Number(url.searchParams.get("offset"));
    return respostaJson({ total_gazettes: 500, gazettes: Array.from({ length: 2 }, (_, i) => diario(offset + i)) });
  });
  const op = opcoes(http);
  const lidos = await coletarTudo(criarConectorQueridoDiario({ janela: JANELA, tamanhoPagina: 2, maxResultados: 6 }), op);
  assert.equal(lidos.length, 6);
  assert.ok(op.metas.some((m) => /parou em 6 de 500 diários/.test(m.aviso ?? "")));

  const formato = httpFalso(() => respostaJson({ gazettes: [] }));
  await assert.rejects(coletarTudo(criarConectorQueridoDiario({ janela: JANELA }), opcoes(formato.http)), /sem total_gazettes/);
  await assert.rejects(
    coletarTudo(criarConectorQueridoDiario({ janela: JANELA, ambiente: { LUNETA_QD_TERRITORIOS: "35501" } }), opcoes(httpProibido())),
    /Código IBGE inválido/,
  );
});

test("aviso de resultado (arrematado por, vencedor, homologação) não vira edital e nenhum nome chega ao banco", async () => {
  const resultado: DiarioQd = {
    ...diario(1),
    excerpts: [
      "RESULTADO DO LEILÃO Nº 2/2026. Lote 01: terreno urbano com 300 m², arrematado por João Carlos Pereira pelo valor de R$ 50.000,00. " +
        "Lote 02: casa, sendo vencedor JOSÉ ANTÔNIO FERREIRA.",
    ],
  };
  const homologacao: DiarioQd = { ...diario(2), excerpts: ["HOMOLOGAÇÃO. Fica homologado o leilão nº 3/2026 do imóvel (terreno), sendo vencedor JOSÉ ANTÔNIO FERREIRA."] };
  const adjudicacao: DiarioQd = { ...diario(3), excerpts: ["TERMO DE ADJUDICAÇÃO. Leilão nº 4/2026, imóvel lote 7 da quadra 2, adjudicado a Pedro Henrique Alves."] };
  // Diário com um resultado e um leilão novo: fica só o trecho do leilão novo.
  const misto: DiarioQd = {
    ...diario(4),
    excerpts: [
      "RESULTADO DO LEILÃO Nº 1/2026: o terreno do lote 3 foi arrematado por Maria Aparecida Souza.",
      "EDITAL DE LEILÃO Nº 5/2026. Leilão de terreno urbano com 360 m² em 25/11/2026, às 10h.",
    ],
  };
  for (const d of [resultado, homologacao, adjudicacao]) assert.equal(queridoDiario.normalizar(d), null, d.excerpts?.[0]);
  const e = queridoDiario.normalizar(misto);
  assert.ok(e && e.registro === "edital");
  assert.doesNotMatch(e.resumo ?? "", /RESULTADO|Maria|Aparecida/);
  assert.equal(e.data_leilao, "2026-11-25T13:00:00.000Z");

  const pasta = mkdtempSync(join(tmpdir(), "luneta-qd-"));
  const banco = join(pasta, "luneta.db");
  try {
    const arquivo = join(pasta, "resultado.json");
    writeFileSync(arquivo, JSON.stringify({ total_gazettes: 4, gazettes: [resultado, homologacao, adjudicacao, misto] }));
    const saida: string[] = [];
    const codigo = await principal(["coletar", "querido_diario", "--arquivo", arquivo, "--banco", banco], {
      http: httpProibido(),
      agora: new Date("2026-10-12T12:00:00Z"),
      saida: (t) => saida.push(t),
      erro: (t) => saida.push(t),
    });
    assert.equal(codigo, 0, saida.join("\n"));
    assert.match(saida.join("\n"), /sucesso[\s\S]*editais 1/);
    const db = abrirBanco(banco);
    try {
      const tudo = JSON.stringify(db.prepare("SELECT * FROM edital").all());
      assert.doesNotMatch(tudo, /Jo[aã]o Carlos|Pereira|JOS[EÉ] ANT[OÔ]NIO|FERREIRA|Pedro Henrique|Maria Aparecida|Souza/i);
    } finally {
      db.close();
    }
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test("resposta válida sem diários (janela vazia) é coleta vazia legítima, inclusive pela CLI com --arquivo", async () => {
  const { http } = httpFalso(() => respostaJson({ total_gazettes: 0, gazettes: [] }));
  const r = await executarColeta(bancoEmMemoria(), criarConectorQueridoDiario({ janela: JANELA }), { http });
  assert.equal(r.status, "sucesso", r.erro ?? "");
  const pasta = mkdtempSync(join(tmpdir(), "luneta-qd-"));
  try {
    const arquivo = join(pasta, "vazio.json");
    writeFileSync(arquivo, JSON.stringify({ total_gazettes: 0, gazettes: [] }));
    const saida: string[] = [];
    const codigo = await principal(["coletar", "querido_diario", "--arquivo", arquivo, "--banco", join(pasta, "b.db")], {
      http: httpProibido(),
      saida: (t) => saida.push(t),
      erro: (t) => saida.push(t),
    });
    assert.equal(codigo, 0, saida.join("\n"));
    assert.match(saida.join("\n"), /sucesso/);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test("coleta pelo núcleo com --arquivo grava o edital", async () => {
  const db = bancoEmMemoria();
  const r = await executarColeta(db, queridoDiario, { arquivo: FIXTURE, http: httpProibido() });
  assert.equal(r.status, "sucesso", r.erro ?? "");
  assert.equal(r.editais, 1);
  assert.equal(r.descartados, 2);
  const linha = db.prepare("SELECT cidade_norm, uf, data_leilao FROM edital").get();
  assert.deepEqual({ ...linha }, { cidade_norm: "vila-exemplo", uf: "SP", data_leilao: "2026-11-20T13:00:00.000Z" });
});

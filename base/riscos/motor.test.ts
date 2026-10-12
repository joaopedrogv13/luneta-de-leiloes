import { test } from "node:test";
import assert from "node:assert/strict";
import { garantirFonte, gravarImoveis } from "../gravar.ts";
import { bancoEmMemoria, conectorFalso, imovelExemplo } from "../testes/apoio.ts";
import { buscar, buscarPrimeira, criarTextoAnalise, trechoAoRedor } from "./evidencia.ts";
import { avaliarImovel, consolidarTags, entradaPara, imovelDeTeste, rodarRiscos, type LinhaRisco, type RegraRisco } from "./motor.ts";
import { REGRAS } from "./regras/index.ts";

const AGORA = new Date("2026-10-12T12:00:00Z");

/** Regra de exemplo, no formato que as regras reais devem seguir. */
const regraOcupacao: RegraRisco = {
  id: "teste/ocupacao-texto",
  descricao: "Procura 'ocupado'/'desocupado' no texto.",
  tags: ["ocupado", "desocupado"],
  avaliar({ textos }) {
    const desocupado = buscarPrimeira(textos, /\bdesocupad[oa]\b/);
    if (desocupado) return [{ tag: "desocupado", valor: "sim", confianca: "media", precisa_revisao: false, origem: desocupado.texto.origem, trecho: desocupado.trecho }];
    const ocupado = buscarPrimeira(textos, /\bocupad[oa]\b/);
    if (ocupado) return [{ tag: "ocupado", valor: "sim", confianca: "media", precisa_revisao: false, origem: ocupado.texto.origem, trecho: ocupado.trecho }];
    return [];
  },
};

test("registro de regras: ids únicos (as regras e seus testes ficam em regras/)", () => {
  assert.ok(Array.isArray(REGRAS));
  assert.equal(new Set(REGRAS.map((r) => r.id)).size, REGRAS.length, "ids únicos");
});

test("textos de análise: índices do normalizado valem no original; trecho mascarado", () => {
  const t = criarTextoAnalise("descricao", "<p>Imóvel OCUPADO pelo executado JOÃO DA SILVA; ação revisional em São Paulo.</p>");
  assert.equal(t.normalizado.length, t.original.length);
  assert.ok(!t.original.includes("JOÃO"), "o texto de análise já vem mascarado");
  const [o] = buscar([t], /acao revisional/);
  assert.ok(o);
  assert.equal(t.original.slice(o.inicio, o.fim), "ação revisional");
  assert.match(o.trecho, /ação revisional/);
  const longo = criarTextoAnalise("edital", `${"texto ".repeat(50)}imóvel desocupado ${"fim ".repeat(50)}`);
  const i = longo.normalizado.indexOf("desocupado");
  const recorte = trechoAoRedor(longo, i, i + 10, 20);
  assert.ok(recorte.startsWith("…") && recorte.endsWith("…"));
  assert.ok(recorte.length < 70);
});

test("avaliarImovel: valida tags, preenche regra, mascara trecho e marca conflito", () => {
  const imovel = imovelDeTeste(imovelExemplo({ descricao: "Imóvel ocupado. Consta também: desocupado em 2020." }), { agora: AGORA });
  const fonte = { id: "teste", capacidades: { fotos: true, documentos: true, ocupacao: false, listaCompleta: true } };
  const entrada = entradaPara(imovel, fonte, AGORA);

  const regraConflitante: RegraRisco = {
    id: "teste/ocupado-fixo",
    descricao: "Sempre diz ocupado, com nome no trecho.",
    tags: ["ocupado"],
    avaliar: () => [{ tag: "ocupado", valor: "sim", confianca: "baixa", precisa_revisao: false, origem: "edital", trecho: "Ocupado pelo executado: JOÃO DA SILVA, CPF 123.456.789-09" }],
  };
  const regraQuebrada: RegraRisco = { id: "teste/quebrada", descricao: "Lança erro.", tags: ["sem-fotos"], avaliar: () => { throw new Error("bug"); } };
  const regraIntrusa: RegraRisco = {
    id: "teste/intrusa",
    descricao: "Emite tag que não declarou.",
    tags: ["sem-fotos"],
    avaliar: () => [{ tag: "cota-parte", valor: "sim", confianca: "alta", precisa_revisao: false, origem: "x", trecho: null }],
  };

  const { riscos, erros } = avaliarImovel(entrada, [regraOcupacao, regraConflitante, regraQuebrada, regraIntrusa]);
  assert.equal(erros.length, 2);
  assert.match(erros.join(" "), /teste\/quebrada falhou/);
  assert.match(erros.join(" "), /não declarada: cota-parte/);
  assert.deepEqual(riscos.map((r) => [r.tag, r.regra, r.precisa_revisao]), [
    ["desocupado", "teste/ocupacao-texto", true],
    ["ocupado", "teste/ocupado-fixo", true],
  ]);
  const trecho = riscos.find((r) => r.regra === "teste/ocupado-fixo")?.trecho ?? "";
  assert.equal(trecho, "Ocupado pelo executado: [NOME], CPF [CPF]");
});

test("rodarRiscos regrava as automáticas e nunca toca nas revisadas", () => {
  const db = bancoEmMemoria();
  const conector = conectorFalso({ registros: () => [] });
  garantirFonte(db, conector, AGORA);
  gravarImoveis(db, "falso", [imovelExemplo({ descricao: "Imóvel desocupado." })], { agora: AGORA });

  const r1 = rodarRiscos(db, { regras: [regraOcupacao], agora: AGORA });
  assert.equal(r1.imoveis, 1);
  assert.equal(r1.riscos, 1);
  assert.equal(db.prepare("SELECT tag FROM risco").get()?.tag, "desocupado");

  // Revisor humano confirma "desocupado" e acrescenta uma tag manual.
  db.prepare("UPDATE risco SET revisado_por = 'revisor-1', revisado_em = '2026-10-12T13:00:00.000Z', confianca = 'alta'").run();
  db.prepare(
    `INSERT INTO risco (imovel_id, tag, valor, confianca, precisa_revisao, origem, trecho, regra, detectado_em, revisado_por, revisado_em)
     SELECT id, 'sem-vistoria', 'sim', 'alta', 0, 'edital', NULL, 'manual', '2026-10-12', 'revisor-1', '2026-10-12T13:00:00.000Z' FROM imovel`,
  ).run();

  const r2 = rodarRiscos(db, { regras: [], agora: AGORA });
  assert.equal(r2.riscos, 0);
  assert.deepEqual(db.prepare("SELECT tag, confianca FROM risco ORDER BY tag").all().map((l) => [l.tag, l.confianca]), [
    ["desocupado", "alta"],
    ["sem-vistoria", "alta"],
  ]);
  assert.throws(() => rodarRiscos(db, { regras: [regraOcupacao, regraOcupacao] }), /id repetido/);
});

test("consolidarTags: revisão humana vence; senão a detecção mais forte", () => {
  const base: Omit<LinhaRisco, "tag" | "valor" | "confianca" | "regra"> = { precisa_revisao: false, origem: "descricao", trecho: null, revisado_por: null, revisado_em: null };
  const linhas: LinhaRisco[] = [
    { ...base, tag: "ocupado", valor: "sim", confianca: "baixa", regra: "a", precisa_revisao: true },
    { ...base, tag: "ocupado", valor: "nao", confianca: "alta", regra: "manual", revisado_por: "revisor", revisado_em: "2026-10-12" },
    { ...base, tag: "cota-parte", valor: "desconhecido", confianca: "alta", regra: "b" },
    { ...base, tag: "cota-parte", valor: "sim", confianca: "media", regra: "c", precisa_revisao: true },
    { ...base, tag: "tag-que-nao-existe", valor: "sim", confianca: "alta", regra: "d" },
  ];
  const c = consolidarTags(linhas);
  assert.deepEqual(c.map((t) => [t.tag, t.valor, t.revisada, t.revisao_pendente]), [
    ["ocupado", "nao", true, false],
    ["cota-parte", "sim", false, true],
  ]);
});

/**
 * Rodada 6 (decisão 1): o lance máximo usa todos os custos e ajustes da conta linha a linha, na venda direta também,
 * e a decomposição "lance + custos = total" que o cartão, o "Meu lance" e o resumo da conta fechada mostram.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { atingeMeta, lanceMaisCustos, simular } from "./calculo";
import { simulacaoCompleta } from "./completa";
import { ESTADO_INICIAL, lanceDaContaPeloLink, type EstadoSimulador } from "./estado";
import type { Ajustes, EntradaSimulador } from "./tipos";

const comum = { fonte: { id: "caixa_csv", nome: "Caixa" }, condicoesPagamento: null, judicial: false, parcelamento: null, ocupacao: null } as const;

/** Casa em São Gonçalo/RJ, venda direta: preço pedido R$ 25.100, avaliação R$ 251.000 (recorte dos dados reais). */
const saoGoncalo: EntradaSimulador = {
  ...comum,
  id: "caixa-1444419640129",
  tipo: "casa",
  titulo: "Casa 3 quartos",
  area: 93.6,
  areaTerreno: 235,
  areaPrivativa: 93.6,
  avaliacao: 251_000,
  lance: 25_100,
  modalidade: "venda_direta",
  modalidadeFonte: "Venda Direta Online",
  uf: "RJ",
  cidade: "São Gonçalo",
  financiamento: false,
  tags: [{ slug: "desagio-alto" }, { slug: "ocupacao-nao-informada" }],
};

/** Apartamento em leilão (SFI), com condomínio. */
const apartamentoLeilao: EntradaSimulador = {
  ...comum,
  id: "caixa-teste-sfi",
  tipo: "apartamento",
  titulo: "Apartamento 2 quartos",
  area: 62,
  areaTerreno: null,
  areaPrivativa: 62,
  avaliacao: 300_000,
  lance: 150_000,
  modalidade: "leilao",
  modalidadeFonte: "Leilão SFI - Edital Único",
  uf: "SP",
  cidade: "São Paulo",
  financiamento: true,
  tags: [{ slug: "ocupacao-nao-informada" }],
};

/** Casa em Campos dos Goytacazes/RJ, venda direta que aceita financiamento. */
const casaCampos: EntradaSimulador = {
  ...comum,
  id: "caixa-0000010172961",
  tipo: "casa",
  titulo: "Casa 244,44 m²",
  area: 244.44,
  areaTerreno: 362.5,
  areaPrivativa: 244.44,
  avaliacao: 628_000,
  lance: 238_341.57,
  modalidade: "venda_direta",
  modalidadeFonte: "Venda Direta Online",
  uf: "RJ",
  cidade: "Campos dos Goytacazes",
  financiamento: true,
  tags: [{ slug: "aceita-financiamento" }],
};

const estado = (extra: Partial<EstadoSimulador> = {}): EstadoSimulador => ({ ...ESTADO_INICIAL, ...extra });
const comAjustes = (ajustes: Ajustes, extra: Partial<EstadoSimulador> = {}) => estado({ ...extra, ajustes });

/** Cada custo da conta, editado para mais caro (o lance máximo tem de cair) ou tirado da conta (tem de subir). */
const MAIS_CAROS: [string, Ajustes][] = [
  ["ITBI em %", { itbiPct: 0.06 }],
  ["ITBI em reais (a guia)", { itbiValor: 30_000 }],
  ["escritura e registro", { registroValor: 15_000 }],
  ["reserva para imprevistos", { reservaPct: 0.1 }],
  ["reforma", { reformaUnitario: 1_000 }],
  ["condomínio", { condominio: 2_000 }],
  ["IPTU por ano", { iptuAnual: 12_000 }],
  ["contas e manutenção", { contas: 1_500 }],
  ["desocupação", { desocupacao: 20_000 }],
  ["dívidas", { dividas: 25_000 }],
  ["corretagem", { corretagemPct: 0.1 }],
  ["imposto de renda", { irPct: 0.25 }],
  ["custo criado (fixo)", { custosExtras: [{ id: "laudo", nome: "Laudo", modo: "fixo", valor: 9_000 }] }],
  ["custo criado (mensal)", { custosExtras: [{ id: "seg", nome: "Seguro", modo: "mensal", valor: 800 }] }],
  ["custo criado (% do lance)", { custosExtras: [{ id: "tx", nome: "Taxa", modo: "pct_lance", valor: 0.05 }] }],
  // revisão da rodada 6: os outros jeitos de mexer num custo (em reais no lugar do %, a base do ITBI, os % do cenário)
  ["comissão em %", { comissaoPct: 0.1 }],
  ["comissão em reais", { comissaoValor: 40_000 }],
  ["corretagem em reais", { corretagemValor: 40_000 }],
  ["reserva em reais", { reservaValor: 20_000 }],
  ["ITBI sobre a avaliação", { itbiBase: "avaliacao", itbiPct: 0.04 }],
  ["% de venda do cenário base", { cenarioBase: 0.85 }],
];

/** Mudanças que barateiam a conta: o lance máximo tem de subir. */
const MAIS_BARATOS: [string, Ajustes][] = [
  ["IR isento", { irIsento: true }],
  ["IPTU e contas por menos meses", { mesesIptu: 1, mesesContas: 1 }],
  ["sem reforma", { desligados: ["reforma"] }],
  ["sem corretagem", { desligados: ["corretagem"] }],
];

for (const [nome, entrada] of [
  ["leilão", apartamentoLeilao],
  ["venda direta", saoGoncalo],
] as const) {
  test(`${nome}: o lance máximo usa cada custo da conta (editar um custo muda o número)`, () => {
    const base = simulacaoCompleta(entrada, ESTADO_INICIAL);
    assert.ok(base.teto !== null && base.teto > 0, "há lance máximo com as premissas padrão");
    for (const [custo, ajustes] of MAIS_CAROS) {
      const r = simulacaoCompleta(entrada, comAjustes(ajustes));
      assert.ok(r.teto !== null && r.teto < base.teto!, `${custo}: ${r.teto} deveria ficar abaixo de ${base.teto}`);
      // no lance máximo a meta é atingida com o custo editado, e R$ 1 a mais já não atinge
      assert.ok(atingeMeta(r.comTeto!, r.meta), custo);
      assert.ok(!atingeMeta(simular(r.modelo, r.teto! + 1, r.celula.cenario, r.celula.meses)!, r.meta), custo);
    }
    for (const [custo, ajustes] of MAIS_BARATOS) {
      const r = simulacaoCompleta(entrada, comAjustes(ajustes));
      assert.ok(r.teto !== null && r.teto > base.teto!, `${custo}: ${r.teto} deveria ficar acima de ${base.teto}`);
      assert.ok(atingeMeta(r.comTeto!, r.meta), custo);
      assert.ok(!atingeMeta(simular(r.modelo, r.teto! + 1, r.celula.cenario, r.celula.meses)!, r.meta), custo);
    }
    // tirar uma linha da conta (o ITBI) sobe o lance máximo; religar volta ao número de antes
    const semItbi = simulacaoCompleta(entrada, comAjustes({ desligados: ["itbi"] }));
    assert.ok(semItbi.teto! > base.teto!);
    assert.equal(simulacaoCompleta(entrada, comAjustes({ desligados: [] })).teto, base.teto);
    // o cenário, o prazo e a meta também entram
    assert.ok(simulacaoCompleta(entrada, estado({ celula: { cenario: "conservador", meses: 12 } })).teto! < base.teto!);
    assert.ok(simulacaoCompleta(entrada, estado({ celula: { cenario: "base", meses: 24 } })).teto! < base.teto!);
    assert.ok(simulacaoCompleta(entrada, estado({ meta: { tipo: "roi_aa", valor: 0.4 } })).teto! < base.teto!);
  });
}

test("decomposição lance + custos = total: fecha no real e bate com a conta linha a linha", () => {
  for (const entrada of [apartamentoLeilao, saoGoncalo]) {
    for (const ajustes of [{}, { reformaUnitario: 1_800, custosExtras: [{ id: "a", nome: "Laudo", modo: "fixo" as const, valor: 3_000 }] }, { desligados: ["reserva" as const] }]) {
      const r = simulacaoCompleta(entrada, comAjustes(ajustes, { lanceDetalhe: "teto" }));
      const d = lanceMaisCustos(r.comTeto!);
      assert.equal(d.lance, r.teto);
      assert.equal(d.lance + d.custos, d.total);
      assert.equal(d.aPrazo, false);
      // à vista, o total é o dinheiro investido da conta
      assert.equal(d.total, Math.round(r.comTeto!.capital));
      // os custos são as linhas da conta fora da venda e do lance (a corretagem e o IR saem da venda)
      const linhas = r.detalhe!.conta.filter((l) => l.grupo !== "venda" && l.id !== "lance").reduce((t, l) => t - l.valor, 0);
      assert.ok(Math.abs(linhas - d.custos) <= 1, `${entrada.id}: ${linhas} × ${d.custos}`);
      const venda = r.detalhe!.conta.filter((l) => l.grupo === "venda" && l.id !== "venda").reduce((t, l) => t - l.valor, 0);
      assert.ok(Math.abs(venda - d.daVenda) <= 1);
    }
  }
});

test("decomposição a prazo: os juros entram nos custos e o total passa do dinheiro investido pelo saldo quitado na venda", () => {
  const r = simulacaoCompleta(casaCampos, comAjustes({ financiar: true }, { lanceDetalhe: "teto" }));
  const s = r.comTeto!;
  const d = lanceMaisCustos(s);
  assert.equal(d.aPrazo, true);
  assert.equal(d.lance + d.custos, d.total);
  assert.ok(Math.abs(d.total - (s.capital + s.financiamento!.saldoDevedor)) <= 1);
  assert.equal(d.saldoNaVenda, Math.round(s.financiamento!.saldoDevedor));
  // juros e seguros fazem parte dos custos
  assert.ok(d.custos > Math.round(s.aquisicao + s.reforma + s.custosMensais - s.mensal.seguros * s.financiamento!.parcelasPagas));
});

test("venda direta: o lance máximo é o maior preço que ainda bate a meta e se compara com o preço pedido", () => {
  const r = simulacaoCompleta(saoGoncalo, ESTADO_INICIAL);
  assert.equal(r.semDisputa, true);
  // pelo preço pedido a meta é atingida exatamente quando o preço pedido não passa do lance máximo
  assert.equal(atingeMeta(r.comLanceMinimo!, r.meta), saoGoncalo.lance <= r.teto!);
  // a margem de segurança e o lucro pelo preço pedido continuam no resultado (informação secundária)
  assert.ok(r.margem !== null && r.margem > 0);
  assert.ok(r.comLanceMinimo!.lucro > 0);
  // a tabela traz o lance máximo e a margem em cada célula
  assert.ok(r.tabela!.flat().every((c) => c.margem !== undefined && (c.teto === null || c.teto > 0)));
  // meta impossível: nenhum preço atinge
  const impossivel = simulacaoCompleta(saoGoncalo, estado({ meta: { tipo: "roi_aa", valor: 9 } }));
  assert.ok(impossivel.teto === null || impossivel.teto < saoGoncalo.lance);
});

test("a prazo: os juros, a entrada e o prazo do financiamento também mudam o lance máximo", () => {
  const base = simulacaoCompleta(casaCampos, comAjustes({ financiar: true }));
  assert.ok(base.teto !== null);
  const juros = simulacaoCompleta(casaCampos, comAjustes({ financiar: true, jurosAA: 0.2 }));
  assert.ok(juros.teto! < base.teto!, "juros mais altos baixam o máximo");
  for (const ajustes of [{ financiar: true, entradaPct: 0.5 }, { financiar: true, prazoFinanciamento: 60 }] as Ajustes[]) {
    const r = simulacaoCompleta(casaCampos, comAjustes(ajustes));
    assert.notEqual(r.teto, base.teto, JSON.stringify(ajustes));
    assert.ok(atingeMeta(r.comTeto!, r.meta));
    assert.ok(!atingeMeta(simular(r.modelo, r.teto! + 1, r.celula.cenario, r.celula.meses)!, r.meta));
  }
});

test("'Editar custos ↓' abre a conta com os mesmos números da conta ao lado do link (revisão da rodada 6)", () => {
  for (const entrada of [apartamentoLeilao, saoGoncalo, casaCampos]) {
    for (const extra of [{}, { meuLance: 180_000 }, { lanceDetalhe: "teto" as const }, { ajustes: { reformaUnitario: 1_500, financiar: true } }]) {
      const antes = estado(extra);
      // o cartão: "lance máximo + custos = investidos" → a conta passa ao lance máximo
      const doCartao = simulacaoCompleta(entrada, lanceDaContaPeloLink(antes, "teto", true));
      assert.deepEqual(lanceMaisCustos(doCartao.detalhe!.sim), lanceMaisCustos(doCartao.comTeto!), `${entrada.id} ${JSON.stringify(extra)}`);
      assert.equal(doCartao.detalhe!.qualLance === "teto" || doCartao.detalhe!.qualLance === "minimo", true);
      // o "Meu lance": "seu lance + custos = investidos" na célula escolhida → a conta passa ao seu lance
      const doMeuLance = simulacaoCompleta(entrada, lanceDaContaPeloLink(antes, "meu", true));
      const cel = doMeuLance.tabela![doMeuLance.linhas.indexOf(doMeuLance.celula.cenario)]![doMeuLance.colunas.indexOf(doMeuLance.celula.meses)]!;
      assert.deepEqual(lanceMaisCustos(doMeuLance.detalhe!.sim), lanceMaisCustos(cel.comMeuLance), `${entrada.id} ${JSON.stringify(extra)}`);
    }
  }
  // sem lance máximo (nenhum lance atinge a meta), ou já no mesmo lance: o estado não muda (nada a gravar)
  const e = estado();
  assert.equal(lanceDaContaPeloLink(e, "teto", false), e);
  assert.equal(lanceDaContaPeloLink(e, "meu", true), e);
  assert.equal(lanceDaContaPeloLink(estado({ lanceDetalhe: "teto" }), "meu", false).lanceDetalhe, "meu");
});

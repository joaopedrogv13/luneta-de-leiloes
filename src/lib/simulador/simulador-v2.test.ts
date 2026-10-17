/**
 * Simulador v2 (rodada 3): ocupação, metas fáceis (ao mês), cenário personalizado, custos criados, linhas
 * tiradas da conta, ITBI/IPTU/reforma/IR com mais opções, estado guardado e a função completa usada pela tela
 * e pelo PDF. Os quatro imóveis do dono (apartamento, casa, terreno e a casa de São Gonçalo) vêm com os dados
 * reais do instantâneo de 12/10/2026.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ReferenciaM2 } from "../catalogo/tipos";
import { lerLista, lerParte, montarDetalhe, parteDoId, pastaPadrao } from "../catalogo/instantaneo";
import { atingeMeta, cascata, lanceMaximo, simular } from "./calculo";
import { adicionaveis, contarAjustes, linhasDaConta } from "./conta";
import { completarModelo, simulacaoCompleta } from "./completa";
import { chaveEstado, ESTADO_INICIAL, interpretarEstado, serializarEstado, type EstadoSimulador } from "./estado";
import { colunasDaMatriz, limparAjustes, limparMeta, montarModelo, multiplicador, ocupadoComCerteza, PADRAO } from "./premissas";
import { converterMeta, metaPorExtenso, notaIr, vendaDoCenario, vendaDoCenarioCurta } from "./textos";
import type { EntradaSimulador } from "./tipos";

const perto = (real: number, esperado: number, tol = 0.01, msg?: string) =>
  assert.ok(Math.abs(real - esperado) <= tol, `${msg ?? ""} esperado ${esperado}, veio ${real}`);

// ---------------------------------------------------------------------------------------------------------
// Os quatro imóveis do dono (recorte dos dados reais)
// ---------------------------------------------------------------------------------------------------------

const comum = { fonte: { id: "caixa_csv", nome: "Caixa" }, condicoesPagamento: null, judicial: false, parcelamento: null, ocupacao: null } as const;

/** Casa em São Gonçalo/RJ, venda direta, lance R$ 25.100, avaliação R$ 251.000, 93,6 m² construídos (lote de 235 m²). */
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
  tags: [{ slug: "desagio-alto" }, { slug: "imovel-inteiro" }, { slug: "ocupacao-nao-informada" }, { slug: "praca-unica" }],
};

/** Apartamento judicial em São Caetano do Sul/SP (Leilões Judiciais), 2ª praça, parcelamento da fonte, dívidas em revisão. */
const apartamentoLj: EntradaSimulador = {
  ...comum,
  id: "lj-222141",
  tipo: "apartamento",
  titulo: "Apto - 240,80m² - Box 9-10 e 20 - São Caetano do Sul/SP",
  area: 240.8,
  areaTerreno: null,
  areaPrivativa: 240.8,
  avaliacao: 1_845_019.7,
  lance: 922_509.85,
  modalidade: "leilao",
  modalidadeFonte: null,
  fonte: { id: "leiloesjudiciais_api", nome: "Leilões Judiciais" },
  uf: "SP",
  cidade: "São Caetano do Sul",
  financiamento: null,
  parcelamento: true,
  judicial: true,
  condicoesPagamento: "Entrada de 25% e o restante em até 30 parcelas (IPCA)",
  tags: [
    { slug: "divida-passa-arrematante", emRevisao: true },
    { slug: "condominio-em-atraso", emRevisao: true },
    { slug: "desagio-alto" },
    { slug: "segunda-praca" },
    { slug: "ocupacao-nao-informada" },
  ],
};

/** Casa em Campos dos Goytacazes/RJ, venda direta online, aceita financiamento. */
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
  tags: [{ slug: "desagio-alto" }, { slug: "aceita-financiamento" }, { slug: "ocupacao-nao-informada" }],
};

/** Terreno de 600 m² em Cocal do Sul/SC, venda online. */
const terrenoCocal: EntradaSimulador = {
  ...comum,
  id: "caixa-0000010003975",
  tipo: "terreno",
  titulo: "Terreno 600 m²",
  area: 600,
  areaTerreno: 600,
  areaPrivativa: null,
  avaliacao: 375_000,
  lance: 188_902.24,
  modalidade: "venda_online",
  modalidadeFonte: "Venda Online",
  uf: "SC",
  cidade: "Cocal do Sul",
  financiamento: false,
  tags: [{ slug: "desagio-alto" }, { slug: "ocupacao-nao-informada" }],
};

const QUATRO = [apartamentoLj, casaCampos, terrenoCocal, saoGoncalo];

function estado(extra: Partial<EstadoSimulador> = {}): EstadoSimulador {
  return { ...ESTADO_INICIAL, ...extra };
}

// ---------------------------------------------------------------------------------------------------------
// Ponto 3: reserva de desocupação só com ocupação certa
// ---------------------------------------------------------------------------------------------------------

test("desocupação: só entra quando o imóvel está ocupado com certeza", () => {
  // não informado (os quatro imóveis): sem reserva e sem aviso
  for (const e of QUATRO) {
    const m = montarModelo(e);
    assert.equal(m.ocupado, false, e.id);
    assert.equal(m.premissas.desocupacao, 0, e.id);
    assert.equal(m.padrao.desocupacao, 0, e.id);
  }
  // a fonte diz ocupado
  assert.equal(montarModelo({ ...saoGoncalo, ocupacao: "ocupado" }).premissas.desocupacao, PADRAO.desocupacao);
  // tag "ocupado" lida por uma pessoa conta; em revisão, não
  assert.equal(ocupadoComCerteza({ ocupacao: null, tags: [{ slug: "ocupado" }] }), true);
  assert.equal(ocupadoComCerteza({ ocupacao: null, tags: [{ slug: "ocupado", emRevisao: true }] }), false);
  // a fonte dizendo desocupado vence a tag
  assert.equal(ocupadoComCerteza({ ocupacao: "desocupado", tags: [{ slug: "ocupado" }] }), false);
  assert.equal(montarModelo({ ...saoGoncalo, ocupacao: "desocupado" }).premissas.desocupacao, 0);

  // continua possível acrescentar a desocupação como custo
  const m = montarModelo(saoGoncalo);
  assert.ok(adicionaveis(m).some((a) => a.editor === "desocupacao"));
  const com = montarModelo(saoGoncalo, { desocupacao: 15_000 });
  const s0 = simular(m, 25_100, "base", 18)!;
  const s1 = simular(com, 25_100, "base", 18)!;
  perto(s0.lucro - s1.lucro, 15_000);
  assert.ok(!adicionaveis(com).some((a) => a.editor === "desocupacao"));
  assert.ok(linhasDaConta(com, s1).conta.some((l) => l.id === "desocupacao"));
  assert.ok(!linhasDaConta(m, s0).conta.some((l) => l.id === "desocupacao"));
});

// ---------------------------------------------------------------------------------------------------------
// A casa de São Gonçalo, conferida à mão
// ---------------------------------------------------------------------------------------------------------

test("São Gonçalo (casa, venda direta, lance R$ 25.100): conta conferida à mão, base, 18 meses", () => {
  const m = montarModelo(saoGoncalo);
  const p = m.premissas;
  assert.equal(p.comissaoPct, 0); // venda direta: sem leiloeiro
  assert.equal(p.condominio, 0); // casa fora de condomínio
  assert.equal(p.reformaUnitario, 450); // reforma leve de casa
  const s = simular(m, 25_100, "base", 18)!;
  perto(s.venda, 251_000);
  perto(s.corretagem, 15_060);
  perto(s.itbi, 753);
  perto(s.registro, 3_000); // piso
  perto(s.reserva, 1_255);
  perto(s.aquisicao, 5_008);
  perto(s.desocupacao, 0);
  perto(s.reforma, 42_120); // 450 × 93,6
  perto(s.mensal.iptu, 209.17, 0.01); // 1% × 251 mil ÷ 12
  perto(s.custosMensais, 7_365); // (209,17 + 200) × 18
  perto(s.ganhoCapital, 164_967); // 251.000 − 15.060 − 25.100 − 753 − 3.000 − 42.120
  perto(s.ir, 24_745.05);
  perto(s.lucro, 131_601.95);
  perto(s.capital, 79_593);
  perto(s.lucroAno, 87_734.63); // 131.601,95 × 12 ÷ 18
  perto(s.roiAA, Math.pow(1 + 131_601.95 / 79_593, 12 / 18) - 1, 1e-9);
  perto(s.roiAM, Math.pow(1 + 131_601.95 / 79_593, 1 / 18) - 1, 1e-9);

  // a meta de 20% ao ano: o teto atinge e R$ 1 a mais não
  const teto = lanceMaximo(m, "base", 18, { tipo: "roi_aa", valor: 0.2 })!;
  assert.ok(teto > 25_100);
  assert.ok(atingeMeta(simular(m, teto, "base", 18)!, { tipo: "roi_aa", valor: 0.2 }));
  assert.ok(!atingeMeta(simular(m, teto + 1, "base", 18)!, { tipo: "roi_aa", valor: 0.2 }));
});

// ---------------------------------------------------------------------------------------------------------
// Metas
// ---------------------------------------------------------------------------------------------------------

test("meta ao mês equivale à mesma meta ao ano; conversões entre períodos", () => {
  const m = montarModelo(casaCampos);
  const aa = lanceMaximo(m, "base", 12, { tipo: "roi_aa", valor: 0.2 })!;
  const am = lanceMaximo(m, "base", 12, { tipo: "roi_am", valor: Math.pow(1.2, 1 / 12) - 1 })!;
  assert.ok(Math.abs(aa - am) <= 2, `${aa} × ${am}`);
  // no total em 12 meses = ao ano
  const total = lanceMaximo(m, "base", 12, { tipo: "roi_periodo", valor: 0.2 })!;
  assert.ok(Math.abs(aa - total) <= 2);

  // 20% ao ano ≈ 1,53% ao mês ≈ 31,5% no total em 18 meses
  const c = converterMeta({ tipo: "roi_aa", valor: 0.2 }, "roi_am", 18);
  assert.equal(c.tipo, "roi_am");
  perto(c.valor, 0.0153, 1e-9);
  perto(converterMeta({ tipo: "roi_aa", valor: 0.2 }, "roi_periodo", 18).valor, 0.315, 1e-9);
  perto(converterMeta({ tipo: "roi_am", valor: 0.01 }, "roi_aa", 18).valor, 0.127, 1e-9);
  assert.deepEqual(converterMeta({ tipo: "lucro", valor: 50_000 }, "roi_aa", 12), { tipo: "roi_aa", valor: 0.2 });

  assert.equal(metaPorExtenso({ tipo: "roi_am", valor: 0.015 }), "1,5% ao mês");
  assert.equal(metaPorExtenso({ tipo: "roi_am", valor: 0.0153 }), "1,53% ao mês");
  assert.equal(metaPorExtenso({ tipo: "roi_periodo", valor: 0.3 }), "30% no total");
  assert.equal(metaPorExtenso({ tipo: "lucro", valor: 50_000 }), "R$ 50.000 de lucro");
  assert.deepEqual(limparMeta({ tipo: "roi_am", valor: 0.01 }), { tipo: "roi_am", valor: 0.01 });
});

// ---------------------------------------------------------------------------------------------------------
// Ponto 6: cenários editáveis, base de venda e personalizado
// ---------------------------------------------------------------------------------------------------------

function ref(escopo: ReferenciaM2["escopo"], mediana: number, tipo: ReferenciaM2["tipo"] = "casa"): ReferenciaM2 {
  return {
    escopo,
    nome: escopo === "bairro" ? "Tribobo, São Gonçalo/RJ" : "São Gonçalo/RJ",
    tipo,
    amostra: 20,
    avaliacaoM2: { mediana, p25: mediana * 0.8, p75: mediana * 1.2 },
    lanceM2: { mediana: mediana * 0.6, p25: mediana * 0.5, p75: mediana * 0.7 },
    imovel: { avaliacaoM2: 2682, lanceM2: 268 },
    percentilLance: 5,
  };
}

test("cenários: % editáveis, base sobre a avaliação ou a região, personalizado em % ou R$", () => {
  const refs = [ref("bairro", 2000)];
  const m = montarModelo(saoGoncalo, { cenarioConservador: 0.8, cenarioOtimista: 1.25 }, refs);
  assert.equal(m.premissas.baseVenda, "avaliacao");
  perto(simular(m, 25_100, "conservador", 12)!.venda, 200_800);
  perto(simular(m, 25_100, "otimista", 12)!.venda, 313_750);
  // as duas bases ficam à vista para a pessoa escolher
  assert.equal(m.opcoesVenda.avaliacao, 251_000);
  assert.equal(m.opcoesVenda.regiao!.valor, 187_200); // 2.000 × 93,6
  // a pessoa escolhe a região
  const r = montarModelo(saoGoncalo, { baseVenda: "regiao" }, refs);
  assert.equal(r.premissas.baseVenda, "regiao");
  assert.equal(r.origemVenda.tipo, "referencia");
  perto(simular(r, 25_100, "base", 12)!.venda, 187_200);
  // sem referência, "região" cai na avaliação
  assert.equal(montarModelo(saoGoncalo, { baseVenda: "regiao" }).premissas.valorVenda, 251_000);
  // valor informado vence a base
  const inf = montarModelo(saoGoncalo, { baseVenda: "regiao", valorVenda: 300_000 }, refs);
  assert.equal(inf.premissas.baseVenda, "informado");
  assert.equal(inf.premissas.valorVenda, 300_000);

  // personalizado em %: 95%; em R$: R$ 230 mil (vira fração da referência)
  const pp = montarModelo(saoGoncalo, { vendaPersonalizada: { modo: "pct", valor: 0.95 } });
  perto(simular(pp, 25_100, "personalizado", 12)!.venda, 238_450);
  const pv = montarModelo(saoGoncalo, { vendaPersonalizada: { modo: "valor", valor: 230_000 } });
  perto(simular(pv, 25_100, "personalizado", 12)!.venda, 230_000);
  perto(multiplicador(pv.premissas, "personalizado"), 230_000 / 251_000, 1e-12);
  // a matriz ganha a linha do personalizado
  const r2 = simulacaoCompleta(saoGoncalo, estado({ ajustes: { vendaPersonalizada: { modo: "valor", valor: 230_000 } }, celula: { cenario: "personalizado", meses: 12 } }));
  assert.deepEqual(r2.linhas, ["conservador", "base", "otimista", "personalizado"]);
  assert.equal(r2.tabela!.length, 4);
  perto(r2.detalhe!.sim.venda, 230_000);
  // sem personalizado definido, a célula volta ao base
  const r3 = simulacaoCompleta(saoGoncalo, estado({ celula: { cenario: "personalizado", meses: 12 } }));
  assert.equal(r3.celula.cenario, "base");
  assert.equal(r3.linhas.length, 3);
});

test("prazo escolhido fora das colunas entra como coluna extra", () => {
  assert.deepEqual(colunasDaMatriz([6, 12, 18, 24], 9), [6, 9, 12, 18, 24]);
  assert.deepEqual(colunasDaMatriz([6, 12, 18, 24], 12), [6, 12, 18, 24]);
  // prazos digitados repetidos ou fora de ordem: colunas em ordem e sem repetir (chave única na tabela)
  assert.deepEqual(colunasDaMatriz([6, 6, 18, 24], 12), [6, 12, 18, 24]);
  assert.deepEqual(colunasDaMatriz([30, 12, 18, 24], 12), [12, 18, 24, 30]);
  const rep = simulacaoCompleta(saoGoncalo, estado({ ajustes: { prazos: [6, 6, 18, 24] } }));
  assert.deepEqual(rep.colunas, [6, 12, 18, 24]);
  assert.equal(rep.tabela![0]!.length, 4);
  const r = simulacaoCompleta(saoGoncalo, estado({ celula: { cenario: "base", meses: 36 } }));
  assert.deepEqual(r.colunas, [6, 12, 18, 24, 36]);
  assert.equal(r.colunaExtra, 36);
  assert.equal(r.detalhe!.sim.meses, 36);
  assert.equal(r.teto, lanceMaximo(r.modelo, "base", 36, r.meta));
});

// ---------------------------------------------------------------------------------------------------------
// Pontos 7 e 8: linhas editáveis, retirar/religar, custos criados
// ---------------------------------------------------------------------------------------------------------

test("custos criados: valor fixo, % do lance e mensal; não abatem o IR", () => {
  const base = montarModelo(saoGoncalo);
  const m = montarModelo(saoGoncalo, {
    custosExtras: [
      { id: "laudo", nome: "Laudo de vistoria", modo: "fixo", valor: 2_000 },
      { id: "assessoria", nome: "Assessoria jurídica", modo: "pct_lance", valor: 0.05 },
      { id: "seguro", nome: "Seguro residencial", modo: "mensal", valor: 50 },
    ],
  });
  const s0 = simular(base, 25_100, "base", 18)!;
  const s = simular(m, 25_100, "base", 18)!;
  perto(s.extrasTotal, 2_000 + 1_255 + 900);
  perto(s.lucro, s0.lucro - 4_155);
  perto(s.capital, s0.capital + 4_155);
  perto(s.ir, s0.ir);
  perto(s.mensal.extras, 50);
  const etapas = cascata(s);
  perto(
    etapas.reduce((t, e) => (e.total ? t : t + e.valor), 0),
    s.lucro,
    1e-6,
  );
  const { conta } = linhasDaConta(m, s);
  assert.deepEqual(
    conta.filter((l) => l.editor === "extra").map((l) => [l.rotulo, l.grupo, Math.round(l.valor)]),
    [
      ["Laudo de vistoria", "depois", -2_000],
      ["Assessoria jurídica", "depois", -1_255],
      ["Seguro residencial", "mensal", -900],
    ],
  );
  // a conta fecha no lucro
  perto(
    conta.reduce((t, l) => t + l.valor, 0),
    s.lucro,
    1e-6,
  );
});

test("retirar uma linha: entra como zero, aparece em 'retiradas' com o valor que teria, e religa", () => {
  const m = montarModelo(saoGoncalo, { desligados: ["itbi", "reserva"] });
  const s0 = simular(montarModelo(saoGoncalo), 25_100, "base", 18)!;
  const s = simular(m, 25_100, "base", 18)!;
  perto(s.itbi, 0);
  perto(s.reserva, 0);
  // sem ITBI o ganho de capital sobe (o IR come 15% do que o ITBI deixava de custar)
  perto(s.lucro, s0.lucro + 753 * (1 - 0.15) + 1_255, 1e-6);
  const { conta, retiradas } = linhasDaConta(m, s);
  assert.deepEqual(
    retiradas.map((l) => [l.id, Math.round(l.valor)]),
    [
      ["itbi", -753],
      ["reserva", -1_255],
    ],
  );
  assert.ok(!conta.some((l) => l.id === "itbi"));
  perto(
    conta.reduce((t, l) => t + l.valor, 0),
    s.lucro,
    1e-6,
  );
  // custo criado também pode sair da conta
  const x = montarModelo(saoGoncalo, { custosExtras: [{ id: "a1", nome: "Taxa", modo: "fixo", valor: 1_000 }], desligados: ["extra:a1"] });
  perto(simular(x, 25_100, "base", 18)!.extrasTotal, 0);
  assert.equal(contarAjustes(x), 2); // um custo criado e uma linha tirada
});

test("ITBI sobre a avaliação ou o maior; IPTU em R$ por ano; meses de cada custo; IR isento; reforma em valor total", () => {
  const sim = (a: Parameters<typeof montarModelo>[1]) => simular(montarModelo(saoGoncalo, a), 25_100, "base", 18)!;
  perto(sim({ itbiBase: "avaliacao" }).itbi, 7_530); // 3% × 251 mil
  perto(sim({ itbiBase: "maior" }).itbi, 7_530);
  perto(sim({ itbiBase: "maior", itbiPct: 0.02 }).itbi, 5_020);
  // IPTU do carnê: R$ 1.200 por ano = R$ 100 por mês
  perto(sim({ iptuAnual: 1_200 }).mensal.iptu, 100);
  // contas só por 6 meses (o resto do prazo, por exemplo, alugado)
  const c6 = sim({ mesesContas: 6 });
  assert.equal(c6.mesesCusto.contas, 6);
  perto(sim({}).custosMensais - c6.custosMensais, 200 * 12);
  // mais meses que o prazo de venda: vale o prazo (depois da venda o custo é do comprador)
  const c30 = sim({ mesesContas: 30, mesesCondominio: 30, mesesIptu: 30 });
  assert.deepEqual(c30.mesesCusto, { condominio: 18, iptu: 18, contas: 18 });
  perto(c30.custosMensais, sim({}).custosMensais);
  const m12 = montarModelo(saoGoncalo, { mesesContas: 12 });
  assert.equal(simular(m12, 25_100, "base", 6)!.mesesCusto.contas, 6);
  assert.equal(simular(m12, 25_100, "base", 24)!.mesesCusto.contas, 12);
  // isenção: IR zero
  assert.equal(sim({ irIsento: true }).ir, 0);
  // reforma em valor total: R$ 30 mil, não depende da área
  perto(sim({ reformaModo: "fixo", reformaUnitario: 30_000 }).reforma, 30_000);
  // trocar o modo sem dar valor mantém o mesmo custo (a tabela × área, em reais)
  perto(sim({ reformaModo: "fixo" }).reforma, 42_120);
  // ITBI sobre a avaliação não depende do lance: o lance máximo segue bem definido
  const m = montarModelo(saoGoncalo, { itbiBase: "avaliacao" });
  const t = lanceMaximo(m, "base", 18, { tipo: "roi_aa", valor: 0.2 })!;
  assert.ok(atingeMeta(simular(m, t, "base", 18)!, { tipo: "roi_aa", valor: 0.2 }));
  assert.ok(!atingeMeta(simular(m, t + 1, "base", 18)!, { tipo: "roi_aa", valor: 0.2 }));
});

// ---------------------------------------------------------------------------------------------------------
// Estado guardado e limpeza
// ---------------------------------------------------------------------------------------------------------

test("estado: chave, ida e volta, versão 1 convertida, lixo descartado", () => {
  assert.equal(chaveEstado("caixa-1444419640129"), "luneta:simulador:v2:caixa-1444419640129");
  const e: EstadoSimulador = {
    ajustes: {
      itbiBase: "maior",
      custosExtras: [{ id: "a1", nome: "Laudo", modo: "fixo", valor: 2_000 }],
      desligados: ["reserva", "extra:a1"],
      vendaPersonalizada: { modo: "pct", valor: 0.95 },
      mesesCondominio: 6,
      iptuAnual: 1_500,
      irIsento: true,
      reformaModo: "fixo",
      baseVenda: "regiao",
    },
    meta: { tipo: "roi_am", valor: 0.012 },
    celula: { cenario: "personalizado", meses: 9 },
    visao: "lucro",
    meuLance: 30_000,
    lanceDetalhe: "teto",
  };
  assert.deepEqual(interpretarEstado(serializarEstado(e)), e);
  // v1: célula pelo índice da coluna
  const v1 = JSON.stringify({ ajustes: { prazos: [3, 9, 30, 60] }, meta: { tipo: "lucro", valor: 50_000 }, celula: { cenario: "otimista", prazo: 2 }, visao: "teto", meuLance: null });
  const lido = interpretarEstado(v1, true);
  assert.deepEqual(lido.celula, { cenario: "otimista", meses: 30 });
  assert.deepEqual(lido.meta, { tipo: "lucro", valor: 50_000 });
  // lixo
  assert.deepEqual(interpretarEstado("{x"), ESTADO_INICIAL);
  assert.deepEqual(interpretarEstado(JSON.stringify({ celula: { cenario: "x", meses: 999 }, lanceDetalhe: 3 })).celula, ESTADO_INICIAL.celula);
  // ajustes novos fora da faixa ou malformados saem
  assert.deepEqual(
    limparAjustes({
      itbiBase: "x",
      custosExtras: [{ id: "A B", nome: "x", modo: "fixo", valor: 1 }, { id: "ok", nome: "  ", modo: "fixo", valor: 1 }, { id: "ok2", nome: "Taxa", modo: "pct_lance", valor: 3 }],
      desligados: ["lance", "venda", "itbi", "itbi", "extra:"],
      vendaPersonalizada: { modo: "pct", valor: 9 },
      mesesIptu: 2.5,
      iptuAnual: -1,
    }),
    { desligados: ["itbi"] },
  );
});

// ---------------------------------------------------------------------------------------------------------
// A função completa (tela e PDF), nos quatro imóveis
// ---------------------------------------------------------------------------------------------------------

test("simulacaoCompleta: os quatro imóveis do dono", () => {
  for (const e of QUATRO) {
    const r = simulacaoCompleta(e, ESTADO_INICIAL);
    assert.ok(r.tabela, e.id);
    assert.deepEqual(r.colunas, [6, 12, 18, 24]);
    assert.equal(r.colunaExtra, null);
    assert.ok(r.detalhe, e.id);
    const d = r.detalhe!;
    // a conta fecha no lucro e na cascata
    perto(
      d.conta.reduce((t, l) => t + l.valor, 0),
      d.sim.lucro,
      1e-6,
      e.id,
    );
    assert.equal(d.qualLance, "minimo");
    assert.equal(d.retiradas.length, 0);
    assert.equal(r.ajustes, 0);
    // nenhum dos quatro tem ocupação informada: sem linha de desocupação
    assert.ok(!d.conta.some((l) => l.id === "desocupacao"), e.id);
  }

  // apartamento judicial: dívidas apontadas (em revisão) e ainda sem valor
  const lj = simulacaoCompleta(apartamentoLj, ESTADO_INICIAL);
  assert.equal(lj.semDividas, true);
  assert.ok(lj.detalhe!.conta.some((l) => l.id === "dividas"));
  assert.ok(lj.modelo.podeParcelar);
  assert.equal(lj.modelo.premissas.parcelasEntradaPct, 0.25);
  assert.equal(lj.modelo.premissas.comissaoPct, 0.05);
  assert.equal(lj.modelo.premissas.condominio, Math.round(9 * 240.8));
  // parcelado: a conta ganha a correção das parcelas e ainda fecha
  const ljp = simulacaoCompleta(apartamentoLj, estado({ ajustes: { parcelar: true } }));
  assert.ok(ljp.detalhe!.conta.some((l) => l.id === "juros"));
  perto(
    ljp.detalhe!.conta.reduce((t, l) => t + l.valor, 0),
    ljp.detalhe!.sim.lucro,
    1e-6,
  );

  // casa com financiamento: seguros e juros entram, e o teto sobe
  const fin = simulacaoCompleta(casaCampos, estado({ ajustes: { financiar: true } }));
  assert.ok(fin.detalhe!.conta.some((l) => l.id === "seguros"));
  assert.ok(fin.teto! > simulacaoCompleta(casaCampos, ESTADO_INICIAL).teto!);

  // terreno: limpeza e cercamento em valor fixo, sem condomínio
  const t = simulacaoCompleta(terrenoCocal, ESTADO_INICIAL);
  assert.equal(t.detalhe!.conta.find((l) => l.id === "reforma")!.rotulo, "Limpeza e cercamento");
  assert.ok(!t.detalhe!.conta.some((l) => l.id === "condominio"));
  assert.ok(t.adicionaveis.some((a) => a.editor === "condominio")); // loteamento fechado

  // venda online (há disputa) com o lance máximo no detalhe
  const vo = simulacaoCompleta(terrenoCocal, estado({ lanceDetalhe: "teto", celula: { cenario: "base", meses: 18 } }));
  assert.equal(vo.semDisputa, false);
  assert.equal(vo.detalhe!.qualLance, "teto");
  assert.equal(Math.round(vo.detalhe!.sim.lance), vo.teto);
  perto(vo.detalhe!.sim.roiAA, 0.2, 1e-4);
  // o mesmo resultado a partir do modelo pronto
  assert.equal(completarModelo(vo.modelo, vo.estado).teto, vo.teto);
  assert.equal(vo.margem, null);
  assert.equal(vo.visao, "teto");
});

test("venda direta (preço fixo): a conta usa o preço pedido, a margem de segurança e a tabela abre no lucro", () => {
  // São Gonçalo é venda direta: "lance máximo no detalhe" não existe (o preço não sobe)
  const sg = simulacaoCompleta(saoGoncalo, estado({ lanceDetalhe: "teto", celula: { cenario: "base", meses: 12 } }));
  assert.equal(sg.semDisputa, true);
  assert.equal(sg.visao, "lucro");
  assert.equal(sg.detalhe!.qualLance, "minimo");
  assert.equal(sg.detalhe!.sim.lance, saoGoncalo.lance);
  assert.equal(sg.detalhe!.conta.find((l) => l.id === "lance")!.rotulo, "Preço");
  assert.equal(sg.detalhe!.etapas.find((e) => e.chave === "lance")!.rotulo, "Preço");
  // a margem: o maior custo imprevisto (de uma vez) que ainda deixa 20% ao ano, pelo preço pedido
  const m = sg.margem!;
  assert.ok(m > 0);
  const comImprevisto = (c: number) =>
    simulacaoCompleta(saoGoncalo, estado({ ajustes: { custosExtras: [{ id: "x", nome: "imprevisto", modo: "fixo", valor: c }] } })).comLanceMinimo!;
  assert.ok(comImprevisto(m).roiAA >= 0.2);
  assert.ok(comImprevisto(m + 2).roiAA < 0.2);
  // cada célula da tabela traz a sua margem; a escolhida é a do cartão
  assert.equal(sg.tabela![sg.linhas.indexOf("base")]![sg.colunas.indexOf(12)]!.margem, m);
  assert.ok(sg.tabela!.flat().every((c) => c.margem !== undefined && (c.margem === null || c.margem >= 0)));
  // meta impossível: sem margem
  assert.equal(simulacaoCompleta(saoGoncalo, estado({ meta: { tipo: "roi_aa", valor: 9 } })).margem, null);
  // a pessoa escolheu a visão do lance máximo: vale a escolha
  assert.equal(simulacaoCompleta(saoGoncalo, estado({ visao: "teto" })).visao, "teto");
});

test("textos: nota do IR conforme a premissa e venda do cenário sem repetir o valor", () => {
  assert.equal(notaIr({ desligados: [], irIsento: false }), "já sem o IR");
  assert.equal(notaIr({ desligados: ["ir"], irIsento: false }), "sem descontar o IR (você tirou da conta)");
  assert.equal(notaIr({ desligados: [], irIsento: true }), "com isenção do IR");
  assert.equal(notaIr({ desligados: [], irIsento: false }, true), "já sem o imposto de renda");
  const r = simulacaoCompleta(casaCampos, estado({ ajustes: { vendaPersonalizada: { modo: "valor", valor: 150_000 } } }));
  assert.equal(vendaDoCenarioCurta(r.modelo, "personalizado"), "valor que você definiu");
  assert.equal(vendaDoCenarioCurta(r.modelo, "base"), vendaDoCenario(r.modelo, "base"));
});

test("simulacaoCompleta com os dados reais do instantâneo (quando o imóvel ainda estiver nele)", async () => {
  const pasta = pastaPadrao();
  const lista = await lerLista(pasta);
  for (const fixo of QUATRO) {
    const k = lista.itens.findIndex((i) => i.id === fixo.id);
    if (k < 0) continue; // saiu da base: os testes acima, com o recorte, continuam valendo
    const resumo = lista.itens[k]!;
    const parcial = (await lerParte(pasta, parteDoId(resumo.id, lista.partes), lista.geradoEm)).get(resumo.id)!;
    const d = montarDetalhe(resumo, lista.enderecos[k] ?? null, parcial);
    const entrada: EntradaSimulador = { ...fixo, ...pick(d), tags: d.tags.map((t) => ({ slug: t.slug, emRevisao: t.emRevisao })) };
    const r = simulacaoCompleta(entrada, ESTADO_INICIAL);
    assert.ok(r.detalhe, fixo.id);
    perto(
      r.detalhe!.conta.reduce((t, l) => t + l.valor, 0),
      r.detalhe!.sim.lucro,
      1e-6,
      fixo.id,
    );
    if (d.ocupacao !== "ocupado") assert.equal(r.modelo.premissas.desocupacao, r.modelo.ocupado ? PADRAO.desocupacao : 0);
  }
});

function pick(d: EntradaSimulador): Omit<EntradaSimulador, "tags"> {
  return {
    id: d.id,
    tipo: d.tipo,
    titulo: d.titulo,
    area: d.area,
    areaTerreno: d.areaTerreno,
    areaPrivativa: d.areaPrivativa,
    avaliacao: d.avaliacao,
    lance: d.lance,
    modalidade: d.modalidade,
    modalidadeFonte: d.modalidadeFonte,
    fonte: d.fonte,
    ocupacao: d.ocupacao,
    uf: d.uf,
    cidade: d.cidade,
    financiamento: d.financiamento,
    parcelamento: d.parcelamento,
    judicial: d.judicial,
    condicoesPagamento: d.condicoesPagamento,
  };
}

test("custos em reais no lugar do %: ITBI, registro, comissão, reserva e corretagem; os que abatem o IR continuam abatendo", () => {
  const base = montarModelo(casaCampos);
  const s0 = simular(base, 100_000, "base", 12)!;
  const m = montarModelo(casaCampos, { itbiValor: 4_321, registroValor: 2_500, comissaoValor: 1_000, reservaValor: 0, corretagemValor: 9_000 });
  const s = simular(m, 100_000, "base", 12)!;
  assert.equal(s.itbi, 4_321);
  assert.equal(s.registro, 2_500);
  assert.equal(s.comissao, 1_000);
  assert.equal(s.reserva, 0);
  assert.equal(s.corretagem, 9_000);
  // o valor não muda com o lance (a guia é a guia)
  assert.equal(simular(m, 150_000, "base", 12)!.itbi, 4_321);
  // o ganho de capital (base do IR) abate os valores informados
  perto(s.ganhoCapital, s.venda - 9_000 - 100_000 - 1_000 - 4_321 - 2_500 - s.reforma, 1e-6);
  assert.notEqual(s0.ganhoCapital, s.ganhoCapital);
  // a conta diz de onde veio, e a linha conta como ajustada
  const { conta } = linhasDaConta(m, s);
  assert.match(conta.find((l) => l.id === "itbi")!.formula, /valor que você informou/);
  assert.match(conta.find((l) => l.id === "registro")!.formula, /valor que você informou/);
  assert.ok(conta.find((l) => l.id === "itbi")!.ajustada);
  // o navegador guarda e lê de volta; valor fora da faixa (ou que não é número) é descartado
  assert.deepEqual(limparAjustes({ itbiValor: 4_321, registroValor: -5, corretagemValor: "9000" }), { itbiValor: 4_321 });
});

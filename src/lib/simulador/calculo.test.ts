import { test } from "node:test";
import assert from "node:assert/strict";
import type { ReferenciaM2 } from "../catalogo/tipos";
import { atingeMeta, cascata, lanceMaximo, matriz, parcelamentoFonte, posicoesCascata, roiAoAno, sac, simular, taxaMensal } from "./calculo";
import { areaDaFonte, lerCondicoesParcelamento, limparAjustes, limparMeta, montarModelo, META_PADRAO, perfilDoImovel } from "./premissas";
import type { EntradaSimulador, Meta } from "./tipos";

const perto = (real: number, esperado: number, tol = 0.01, msg?: string) =>
  assert.ok(Math.abs(real - esperado) <= tol, `${msg ?? ""} esperado ${esperado}, veio ${real}`);

function imovel(extra: Partial<EntradaSimulador> = {}): EntradaSimulador {
  return {
    id: "teste-1",
    tipo: "apartamento",
    titulo: "Apartamento de teste",
    area: 60,
    areaTerreno: null,
    areaPrivativa: 60,
    avaliacao: 300_000,
    lance: 150_000,
    modalidade: "leilao",
    modalidadeFonte: "Leilão SFI - Edital Único",
    fonte: { id: "caixa_csv", nome: "Caixa" },
    ocupacao: null,
    uf: "MG",
    cidade: "Uberlândia",
    financiamento: false,
    parcelamento: false,
    judicial: false,
    condicoesPagamento: null,
    tags: [],
    ...extra,
  };
}

const terreno = () =>
  imovel({
    id: "teste-terreno",
    tipo: "terreno",
    titulo: "Terreno de teste",
    area: 400,
    areaTerreno: 400,
    areaPrivativa: null,
    avaliacao: 100_000,
    lance: 60_000,
    modalidade: "venda_direta",
    modalidadeFonte: "Venda Direta Online",
    ocupacao: "desocupado",
  });

test("apartamento: conta conferida à mão (leilão, ocupação não informada, reforma leve, base, 12 meses)", () => {
  const m = montarModelo(imovel());
  const p = m.premissas;
  assert.equal(p.comissaoPct, 0.05);
  assert.equal(p.desocupacao, 10_000);
  assert.equal(p.reformaNivel, "leve");
  assert.equal(p.reformaUnitario, 350);
  assert.equal(p.condominio, 540); // máx(350, 9 × 60)
  assert.equal(p.areaEstimada, false);

  const s = simular(m, 150_000, "base", 12)!;
  perto(s.venda, 300_000);
  perto(s.corretagem, 18_000);
  perto(s.comissao, 7_500);
  perto(s.itbi, 4_500);
  perto(s.registro, 3_000); // máx(2% × 150 mil = 3.000, 3.000)
  perto(s.reserva, 7_500);
  perto(s.aquisicao, 22_500);
  perto(s.reforma, 21_000); // 350 × 60
  perto(s.mensal.iptu, 250); // 1% × 300 mil ÷ 12
  perto(s.mensal.total, 940); // 540 + 250 + 150
  perto(s.custosMensais, 11_280);
  perto(s.ganhoCapital, 96_000); // 300.000 − 18.000 − 150.000 − 7.500 − 4.500 − 3.000 − 21.000
  perto(s.ir, 14_400);
  perto(s.lucro, 52_820);
  perto(s.capital, 214_780);
  perto(s.roi, 52_820 / 214_780, 1e-9);
  perto(s.roiAA, 52_820 / 214_780, 1e-9); // 12 meses: ao ano = no período
  perto(s.rendimentoAplicacao, 21_478); // 10% de 214.780

  // a cascata fecha no lucro
  const etapas = cascata(s);
  perto(
    etapas.reduce((t, e) => (e.total ? t : t + e.valor), 0),
    s.lucro,
  );
  assert.equal(etapas.at(-1)!.chave, "lucro");
  const pos = posicoesCascata(etapas);
  assert.deepEqual([pos[0].de, pos[0].ate], [0, 300_000]);
  assert.deepEqual([pos[1].de, pos[1].ate], [300_000, 282_000]); // corretagem desce da venda
  perto(pos.at(-2)!.ate, s.lucro); // o último custo termina no lucro
  assert.deepEqual([pos.at(-1)!.de, Math.round(pos.at(-1)!.ate)], [0, 52_820]);

  // 6 meses: mensais pela metade; ao ano = (1 + ROI)² − 1
  const s6 = simular(m, 150_000, "base", 6)!;
  perto(s6.custosMensais, 5_640);
  perto(s6.lucro, 52_820 + 5_640);
  perto(s6.roiAA, Math.pow(1 + s6.roi, 2) - 1, 1e-12);

  // cenários: 90% e 110% da avaliação
  perto(simular(m, 150_000, "conservador", 12)!.venda, 270_000);
  perto(simular(m, 150_000, "otimista", 12)!.venda, 330_000);
});

test("terreno: conta conferida à mão (venda direta sem leiloeiro, desocupado, limpeza fixa)", () => {
  const m = montarModelo(terreno());
  const p = m.premissas;
  assert.equal(p.comissaoPct, 0);
  assert.equal(p.desocupacao, 0);
  assert.equal(p.condominio, 0);
  assert.equal(p.iptuPct, 0.015);
  assert.equal(p.contas, 80);
  assert.equal(m.perfil.modoReforma, "fixo");

  const s = simular(m, 60_000, "base", 12)!;
  perto(s.comissao, 0);
  perto(s.itbi, 1_800);
  perto(s.registro, 3_000); // piso: 2% × 60 mil = 1.200 < 3.000
  perto(s.reserva, 3_000);
  perto(s.reforma, 2_000); // valor fixo, não depende da área
  perto(s.mensal.iptu, 125); // 1,5% × 100 mil ÷ 12
  perto(s.custosMensais, 2_460); // (125 + 80) × 12
  perto(s.ganhoCapital, 27_200);
  perto(s.ir, 4_080);
  perto(s.lucro, 17_660);
  perto(s.capital, 72_260);

  // loteamento fechado: R$ 0,80/m² × 400 m²
  const lot = montarModelo(terreno(), { emCondominio: true });
  assert.equal(lot.premissas.condominio, 320);
});

test("ajustes trocam só o que a pessoa mudou e o padrão segue o que veio antes", () => {
  const m = montarModelo(imovel(), { area: 100, reformaNivel: "media" });
  assert.equal(m.premissas.condominio, 900); // 9 × 100
  assert.equal(m.premissas.reformaUnitario, 900); // R$/m² da reforma média
  assert.equal(m.padrao.reformaNivel, "leve");
  const casa = montarModelo(imovel({ tipo: "casa" }));
  assert.equal(casa.premissas.condominio, 0);
  assert.equal(montarModelo(imovel({ tipo: "casa" }), { emCondominio: true }).premissas.condominio, 240); // 4 × 60
  // financiamento só quando a fonte aceita
  assert.equal(montarModelo(imovel({ financiamento: false }), { financiar: true }).premissas.financiar, false);
  assert.equal(montarModelo(imovel({ financiamento: true }), { financiar: true }).premissas.financiar, true);
});

test("ROI cai (ou fica igual) quando o lance sobe", () => {
  for (const entrada of [imovel(), terreno(), imovel({ avaliacao: null })]) {
    const refs: ReferenciaM2[] = [ref("cidade", 5000)];
    for (const pagamento of [{}, { financiar: true }, { parcelar: true }]) {
      const m = montarModelo({ ...entrada, financiamento: true, parcelamento: true }, pagamento, refs);
      for (const cenario of ["conservador", "base", "otimista"] as const) {
        let anterior = Infinity;
        let lucroAnterior = Infinity;
        for (let L = 0; L <= 400_000; L += 2_500) {
          const s = simular(m, L, cenario, 12)!;
          if (s.lucro >= 0) assert.ok(s.roi <= anterior + 1e-12, `ROI subiu em L=${L}`);
          assert.ok(s.lucro <= lucroAnterior + 1e-9, `lucro subiu em L=${L}`);
          anterior = s.roi;
          lucroAnterior = s.lucro;
        }
      }
    }
  }
});

test("lance máximo: busca binária acerta a meta com precisão de R$ 1", () => {
  const m = montarModelo(imovel());
  const metas: Meta[] = [META_PADRAO, { tipo: "roi_periodo", valor: 0.3 }, { tipo: "lucro", valor: 40_000 }, { tipo: "roi_aa", valor: 0 }];
  for (const meta of metas) {
    for (const meses of [6, 12, 18, 24]) {
      for (const cenario of ["conservador", "base", "otimista"] as const) {
        const L = lanceMaximo(m, cenario, meses, meta);
        assert.ok(L !== null && L > 0, `${meta.tipo} ${cenario} ${meses}m`);
        assert.ok(Number.isInteger(L));
        assert.ok(atingeMeta(simular(m, L, cenario, meses)!, meta), "o teto atinge a meta");
        assert.ok(!atingeMeta(simular(m, L + 1, cenario, meses)!, meta), "um real a mais já não atinge");
      }
    }
  }
  // com lucro como meta, o lucro no teto fica a menos de R$ 1,50 da meta (cada R$ 1 de lance custa ~R$ 1,15)
  const teto = lanceMaximo(m, "base", 12, { tipo: "lucro", valor: 40_000 })!;
  const s = simular(m, teto, "base", 12)!;
  assert.ok(s.lucro >= 40_000 && s.lucro - 40_000 < 1.5, `lucro no teto: ${s.lucro}`);
  // ROI de 20% a.a. no teto: entre 20% e 20% + o efeito de R$ 1
  const t20 = lanceMaximo(m, "base", 12, META_PADRAO)!;
  perto(simular(m, t20, "base", 12)!.roiAA, 0.2, 1e-5);
});

test("lance máximo: nenhum lance atinge uma meta impossível", () => {
  const m = montarModelo(imovel());
  assert.equal(lanceMaximo(m, "base", 12, { tipo: "lucro", valor: 1_000_000 }), null);
  // venda que não paga nem os custos fixos (registro mínimo, desocupação, reforma, condomínio): nem de graça
  const ruim = montarModelo(imovel(), { valorVenda: 30_000 });
  assert.equal(lanceMaximo(ruim, "conservador", 6, META_PADRAO), null);
  assert.ok(simular(ruim, 0, "conservador", 6)!.lucro < 0);
  assert.equal(matriz(ruim, META_PADRAO, 150_000)![0][0].teto, null);
  // com financiamento o capital próprio cai e o teto sobe
  const fin = montarModelo(imovel({ financiamento: true }), { financiar: true });
  const vista = lanceMaximo(m, "base", 12, META_PADRAO)!;
  const financiado = lanceMaximo(fin, "base", 12, META_PADRAO)!;
  assert.ok(financiado > vista, `financiado ${financiado} > à vista ${vista}`);
});

function ref(escopo: ReferenciaM2["escopo"], mediana: number, tipo: ReferenciaM2["tipo"] = "apartamento"): ReferenciaM2 {
  return {
    escopo,
    nome: escopo === "bairro" ? "Centro, Uberlândia/MG" : escopo === "cidade" ? "Uberlândia/MG" : "MG",
    tipo,
    amostra: 12,
    avaliacaoM2: { mediana, p25: mediana * 0.8, p75: mediana * 1.2 },
    lanceM2: { mediana: mediana * 0.6, p25: mediana * 0.5, p75: mediana * 0.7 },
    imovel: { avaliacaoM2: null, lanceM2: 2500 },
    percentilLance: 50,
  };
}

test("sem avaliação: usa a mediana de avaliação/m² da referência mais local × área", () => {
  const e = imovel({ avaliacao: null });
  const m = montarModelo(e, {}, [ref("uf", 3000), ref("cidade", 4000), ref("bairro", 4500)]);
  assert.equal(m.origemVenda.tipo, "referencia");
  assert.equal(m.premissas.valorVenda, 270_000); // 4.500 × 60 (bairro)
  // sem bairro, a cidade
  assert.equal(montarModelo(e, {}, [ref("uf", 3000), ref("cidade", 4000)]).premissas.valorVenda, 240_000);
  // referência de outro tipo não serve
  assert.equal(montarModelo(e, {}, [ref("cidade", 4000, "casa")]).premissas.valorVenda, null);
  // IPTU sem avaliação: 1% ao ano do lance
  perto(simular(m, 120_000, "base", 12)!.mensal.iptu, 100);
  // sem referência: pede o valor (sem simulação nem teto)
  const nada = montarModelo(e);
  assert.equal(nada.origemVenda.tipo, "nenhuma");
  assert.equal(simular(nada, 150_000, "base", 12), null);
  assert.equal(lanceMaximo(nada, "base", 12, META_PADRAO), null);
  assert.equal(matriz(nada, META_PADRAO, 150_000), null);
  // a pessoa informa o valor
  const informado = montarModelo(e, { valorVenda: 280_000 });
  assert.equal(informado.origemVenda.tipo, "ajuste");
  perto(simular(informado, 150_000, "base", 12)!.venda, 280_000);
});

test("sem área: usa a área típica do tipo e marca como estimada; sem avaliação, não inventa a venda", () => {
  const e = imovel({ area: null, areaPrivativa: null });
  const m = montarModelo(e);
  assert.equal(m.premissas.areaEstimada, true);
  assert.equal(m.premissas.area, 60);
  perto(simular(m, 150_000, "base", 12)!.reforma, 21_000); // valor fixo: 350 × 60 m² típicos
  // sem avaliação e sem área, a referência não basta
  const semNada = montarModelo({ ...e, avaliacao: null }, {}, [ref("cidade", 4000)]);
  assert.equal(semNada.origemVenda.tipo, "nenhuma");
  assert.equal(semNada.origemVenda.tipo === "nenhuma" && semNada.origemVenda.motivo, "sem-area");
  // a pessoa informa a área: agora a referência vale
  const comArea = montarModelo({ ...e, avaliacao: null }, { area: 80 }, [ref("cidade", 4000)]);
  assert.equal(comArea.premissas.areaEstimada, false);
  assert.equal(comArea.premissas.valorVenda, 320_000);
  assert.equal(comArea.premissas.condominio, 720);
});

test("financiamento SAC: parcelas, juros e saldo devedor", () => {
  const i = taxaMensal(0.115);
  perto(i, Math.pow(1.115, 1 / 12) - 1, 1e-15);
  perto(Math.pow(1 + i, 12), 1.115, 1e-12);

  const r = sac(160_000, 0.115, 360, 12);
  const amort = 160_000 / 360;
  perto(r.amortizado, amort * 12, 1e-6);
  perto(r.saldoDevedor, 160_000 - amort * 12, 1e-6); // 154.666,67
  perto(r.primeiraParcela, amort + i * 160_000, 1e-6);
  // confere com a tabela mês a mês
  let saldo = 160_000;
  let juros = 0;
  let parcelas = 0;
  for (let k = 1; k <= 12; k++) {
    const j = saldo * i;
    juros += j;
    parcelas += amort + j;
    saldo -= amort;
  }
  perto(r.jurosPagos, juros, 1e-6);
  perto(r.totalParcelas, parcelas, 1e-6);
  perto(r.saldoDevedor, saldo, 1e-6);
  // venda depois do fim do prazo: tudo pago, saldo zero
  const fim = sac(120_000, 0.1, 24, 36);
  assert.equal(fim.parcelasPagas, 24);
  perto(fim.saldoDevedor, 0, 1e-6);
  perto(fim.amortizado, 120_000, 1e-6);

  // simulação financiada: lucro = lucro à vista − juros − seguros; capital = entrada + parcelas + custos
  const vista = simular(montarModelo(imovel({ financiamento: true })), 200_000, "base", 12)!;
  const fm = montarModelo(imovel({ financiamento: true }), { financiar: true });
  const f = simular(fm, 200_000, "base", 12)!;
  const fin = f.financiamento!;
  perto(fin.entrada, 40_000);
  perto(fin.financiado, 160_000);
  perto(fin.jurosPagos, juros, 1e-6);
  perto(f.mensal.seguros, 100);
  perto(f.lucro, vista.lucro - juros - 100 * 12, 1e-6);
  perto(f.capital, 40_000 + parcelas + (vista.capital - 200_000) + 100 * 12, 1e-6);
  perto(f.ir, vista.ir, 1e-9); // juros não abatem o IR (premissa conservadora)
  const etapas = cascata(f);
  perto(
    etapas.reduce((t, e) => (e.total ? t : t + e.valor), 0),
    f.lucro,
    1e-6,
  );
});

test("IR é zero quando há prejuízo", () => {
  const m = montarModelo(imovel());
  const s = simular(m, 290_000, "conservador", 24)!;
  assert.ok(s.ganhoCapital < 0);
  assert.equal(s.ir, 0);
  assert.ok(s.lucro < 0);
  assert.equal(cascata(s).at(-1)!.rotulo, "Prejuízo");
  assert.equal(
    cascata(s).some((e) => e.chave === "ir"),
    false,
  );
  // alíquota ajustada
  const alta = montarModelo(imovel(), { irPct: 0.225 });
  perto(simular(alta, 150_000, "base", 12)!.ir, 0.225 * 96_000);
  assert.equal(roiAoAno(-1.5, 12), -1);
});

test("dívidas apontadas pelas tags e modalidade sem leiloeiro", () => {
  const m = montarModelo(imovel({ tags: [{ slug: "condominio-em-atraso" }, { slug: "ocupado" }, { slug: "divida-passa-arrematante" }] }));
  assert.deepEqual(m.dividasApontadas, ["condomínio em atraso", "dívida que passa ao arrematante"]);
  assert.equal(m.premissas.dividas, 0);
  assert.equal(montarModelo(imovel({ modalidade: "venda_online" })).premissas.comissaoPct, 0);
  assert.equal(montarModelo(imovel({ modalidade: "venda_online", judicial: true })).premissas.comissaoPct, 0.05);
});

test("limpeza do que vem do navegador", () => {
  assert.deepEqual(limparAjustes(null), {});
  assert.deepEqual(limparAjustes({ itbiPct: 0.04, irPct: 2, prazos: [6, 12, 18, 99], reformaNivel: "x", area: "60" }), { itbiPct: 0.04 });
  assert.deepEqual(limparAjustes({ prazos: [3, 9, 30, 60], financiar: true }), { prazos: [3, 9, 30, 60], financiar: true });
  assert.deepEqual(limparMeta({ tipo: "lucro", valor: 50_000 }), { tipo: "lucro", valor: 50_000 });
  assert.deepEqual(limparMeta({ tipo: "roi_aa", valor: -1 }), META_PADRAO);
});

test("construído com a área do terreno no lugar da construída: área não informada (não infla reforma nem venda)", () => {
  // casa sem área privativa: a "área principal" do catálogo caiu na área do lote (360 m²)
  const casa = imovel({ tipo: "casa", area: 360, areaTerreno: 360, areaPrivativa: null, avaliacao: null });
  assert.equal(areaDaFonte(casa), null);
  const m = montarModelo(casa, {}, [ref("cidade", 3000, "casa")]);
  assert.equal(m.premissas.areaEstimada, true);
  assert.equal(m.premissas.area, 100); // área típica de casa, até a pessoa informar
  assert.equal(m.premissas.valorVenda, null); // não multiplica R$/m² de casas pelo tamanho do lote
  // com a área privativa, vale a privativa; terreno segue usando a área do terreno
  assert.equal(areaDaFonte({ ...casa, areaPrivativa: 70 }), 70);
  assert.equal(areaDaFonte({ ...casa, area: 120 }), 120);
  assert.equal(areaDaFonte(terreno()), 400);
});

test("dívidas apontadas por tag ainda em revisão não aparecem como fato", () => {
  const m = montarModelo(imovel({ tags: [{ slug: "iptu-em-atraso", emRevisao: true }, { slug: "condominio-em-atraso", emRevisao: false }] }));
  assert.deepEqual(m.dividasApontadas, ["condomínio em atraso", "IPTU em atraso (em revisão)"]);
});

test("cascata usa o nome da reforma do tipo (limpeza do terreno)", () => {
  const m = montarModelo(terreno());
  const s = simular(m, 60_000, "base", 12)!;
  assert.equal(cascata(s, m.perfil.rotuloReforma).find((e) => e.chave === "reforma")!.rotulo, "Limpeza e cercamento");
  assert.equal(cascata(s).find((e) => e.chave === "reforma")!.rotulo, "Reforma");
});

test("comercial: galpão e prédio inteiro com reforma por m² menor e sem condomínio; sala e loja com condomínio", () => {
  const comercial = (titulo: string, area: number, extra: Partial<EntradaSimulador> = {}) =>
    imovel({ tipo: "comercial", titulo, area, areaPrivativa: null, areaTerreno: null, avaliacao: 1_000_000, lance: 500_000, ...extra });

  // galpão de 10.480 m²: antes, R$ 125.762/mês de condomínio e R$ 3,1 milhões de reforma leve
  const galpao = montarModelo(comercial("Galpão 10.480 m²", 10_480));
  assert.equal(galpao.perfil.grande, true);
  assert.equal(galpao.premissas.condominio, 0);
  assert.equal(galpao.premissas.emCondominio, false);
  assert.equal(galpao.premissas.reformaUnitario, 60);
  perto(simular(galpao, 500_000, "base", 12)!.reforma, 60 * 10_480);

  // prédio pequeno também é "inteiro" pelo título; área grande sem título que diga também
  assert.equal(perfilDoImovel(comercial("Prédio 328,94 m²", 328.94)).grande, true);
  assert.equal(perfilDoImovel(comercial("Imóvel comercial 681 m²", 681)).grande, true);
  assert.equal(perfilDoImovel(comercial("Imóvel comercial 261 m²", 261)).grande, undefined);

  // sala comercial: condomínio ligado de saída (12 × 40), reforma de imóvel construído
  const sala = montarModelo(comercial("Sala comercial 40 m²", 40));
  assert.equal(sala.premissas.emCondominio, true);
  assert.equal(sala.padrao.emCondominio, true);
  assert.equal(sala.premissas.condominio, 480);
  assert.equal(sala.premissas.reformaUnitario, 300);
  // a pessoa desliga
  assert.equal(montarModelo(comercial("Sala comercial 40 m²", 40), { emCondominio: false }).premissas.condominio, 0);
  // loja grande vira "grande": sem condomínio de saída
  assert.equal(montarModelo(comercial("Loja 850,26 m²", 850.26)).premissas.condominio, 0);
  // imóvel comercial genérico: condomínio desligado, mas dá para ligar
  const generico = montarModelo(comercial("Imóvel comercial 329 m²", 329));
  assert.equal(generico.premissas.condominio, 0);
  assert.equal(montarModelo(comercial("Imóvel comercial 329 m²", 329), { emCondominio: true }).premissas.condominio, Math.round(12 * 329));

  // "outro": nunca condomínio de saída
  const outro = montarModelo(imovel({ tipo: "outro", titulo: "Imóveis - Iracemápolis - Itanhaém - São Paulo/SP", area: null, areaPrivativa: null }));
  assert.equal(outro.premissas.condominio, 0);
});

test("parcelamento da fonte (judicial): parcelas corrigidas pelo índice, saldo corrigido quitado na venda", () => {
  // sem correção: 30 parcelas iguais; em 12 meses, 12 pagas e 18 quitadas na venda
  const zero = parcelamentoFonte(300_000, 0, 30, 12);
  perto(zero.totalParcelas, 120_000, 1e-6);
  perto(zero.saldoDevedor, 180_000, 1e-6);
  perto(zero.jurosPagos, 0, 1e-6);

  // com correção: confere com a soma mês a mês
  const i = taxaMensal(0.045);
  const r = parcelamentoFonte(300_000, 0.045, 30, 12);
  let total = 0;
  for (let k = 1; k <= 12; k++) total += 10_000 * Math.pow(1 + i, k);
  perto(r.totalParcelas, total, 1e-6);
  perto(r.saldoDevedor, 180_000 * Math.pow(1 + i, 12), 1e-6);
  perto(r.jurosPagos, r.totalParcelas + r.saldoDevedor - 300_000, 1e-6);
  perto(r.primeiraParcela, 10_000 * (1 + i), 1e-6);
  // venda depois da última parcela: tudo pago
  const fim = parcelamentoFonte(300_000, 0.045, 30, 36);
  assert.equal(fim.parcelasPagas, 30);
  perto(fim.saldoDevedor, 0, 1e-6);

  // condições escritas pela fonte viram os padrões
  assert.deepEqual(lerCondicoesParcelamento("Entrada de 25% e o restante em até 30 parcelas (IPCA)"), { entradaPct: 0.25, parcelas: 30 });
  assert.deepEqual(lerCondicoesParcelamento("30% de entrada, saldo em 12 vezes"), { entradaPct: 0.3, parcelas: 12 });
  assert.deepEqual(lerCondicoesParcelamento(null), {});

  const e = imovel({ judicial: true, parcelamento: true, financiamento: true, condicoesPagamento: "Entrada de 30% e o restante em até 24 parcelas (IPCA)" });
  const m = montarModelo(e, { parcelar: true, financiar: true });
  assert.equal(m.podeParcelar, true);
  assert.equal(m.premissas.parcelar, true);
  assert.equal(m.premissas.financiar, false); // não soma as duas formas a prazo
  assert.equal(m.premissas.parcelasEntradaPct, 0.3);
  assert.equal(m.premissas.parcelasN, 24);

  const vista = simular(montarModelo(e), 200_000, "base", 12)!;
  const s = simular(m, 200_000, "base", 12)!;
  const f = s.financiamento!;
  assert.equal(f.tipo, "fonte");
  perto(f.entrada, 60_000);
  perto(f.financiado, 140_000);
  perto(s.mensal.seguros, 0); // sem seguro de banco
  perto(s.lucro, vista.lucro - f.jurosPagos, 1e-6);
  perto(s.capital, 60_000 + f.totalParcelas + (vista.capital - 200_000), 1e-6);
  perto(
    cascata(s).reduce((t, x) => (x.total ? t : t + x.valor), 0),
    s.lucro,
    1e-6,
  );
  assert.equal(cascata(s).find((x) => x.chave === "juros")!.rotulo, "Correção das parcelas");
  // capital próprio menor: o teto sobe
  assert.ok(lanceMaximo(m, "base", 12, META_PADRAO)! > lanceMaximo(montarModelo(e), "base", 12, META_PADRAO)!);
  // sem parcelamento na fonte, o ajuste não vale
  assert.equal(montarModelo(imovel(), { parcelar: true }).premissas.parcelar, false);
  assert.deepEqual(limparAjustes({ parcelar: true, parcelasN: 30, parcelasEntradaPct: 0.25, parcelasCorrecaoAA: 2 }), { parcelar: true, parcelasN: 30, parcelasEntradaPct: 0.25 });
});

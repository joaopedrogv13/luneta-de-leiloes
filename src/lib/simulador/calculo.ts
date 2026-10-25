/**
 * Contas do simulador. Funções puras (sem React, sem "@/"), testadas em calculo.test.ts.
 *
 *   venda               = valor de referência × % do cenário
 *   aquisição           = comissão + ITBI + escritura/registro (máx. de % e piso) + reserva, sobre o lance
 *                         (o ITBI pode ter outra base: a avaliação, ou o maior entre lance e avaliação); cada um
 *                         pode vir em reais, informado pela pessoa (e a corretagem também)
 *   regularização       = desocupação + dívidas que passam ao comprador
 *   reforma             = R$/m² × área (modo m²) ou valor fixo (terreno, rural, ou se a pessoa preferir)
 *   custos mensais      = condomínio × meses + IPTU/ITR × meses + contas × meses  [+ seguros do financiamento]
 *                         (cada um pode correr menos meses que o prazo, nunca mais; o IPTU pode vir em R$ por ano)
 *   custos criados      = valor fixo, % do lance ou valor × meses (não abatem o IR: conservador)
 *   IR                  = alíquota × (venda − corretagem − lance − comissão − ITBI − registro − reforma), só se > 0
 *                         e sem isenção
 *   lucro               = venda − corretagem − IR − lance − aquisição − regularização − reforma − custos mensais
 *                         − custos criados (financiado: − juros pagos − seguros; o saldo devedor sai da venda)
 *   capital             = dinheiro próprio até a venda (à vista: lance + custos; a prazo: entrada + parcelas + custos)
 *   parcelamento da fonte (judicial): entrada + parcelas mensais de (saldo ÷ n) corrigidas pelo índice; o que
 *                         falta pagar na venda (já corrigido) sai do dinheiro da venda
 *   ROI no período      = lucro ÷ capital;  ROI ao ano = (1 + ROI)^(12/meses) − 1;  ao mês = (1 + ROI)^(1/meses) − 1
 *   lucro por ano       = lucro × 12 ÷ meses (média simples, para ler em reais)
 *
 * Uma linha "desligada" pela pessoa (premissas.desligados) entra como zero; o valor dela fica guardado.
 *
 * O lucro cai e o capital sobe quando o lance sobe; por isso o ROI cai com o lance enquanto o lucro é ≥ 0, e o
 * lance máximo para uma meta ≥ 0 sai por busca binária.
 */
import { cenariosDaMatriz, multiplicador, type Modelo } from "./premissas";
import type { Cenario, ExtraSimulado, LinhaDesligavel, Meta, Premissas, ResultadoFinanciamento, Simulacao } from "./tipos";

const TETO_BUSCA = 1e11;

/** Taxa mensal equivalente a uma taxa anual: (1 + a.a.)^(1/12) − 1. */
export function taxaMensal(aa: number): number {
  return Math.pow(1 + aa, 1 / 12) - 1;
}

/**
 * Financiamento pela tabela SAC (amortização constante), quitado na venda.
 * Parcela do mês k = amortização + juros sobre o saldo do mês anterior.
 */
export function sac(financiado: number, jurosAA: number, prazo: number, meses: number): Omit<ResultadoFinanciamento, "entrada" | "tipo"> {
  const i = taxaMensal(jurosAA);
  const n = Math.max(1, Math.round(prazo));
  const m = Math.min(Math.max(0, Math.round(meses)), n);
  const amortizacao = financiado / n;
  // Σ_{k=1..m} saldo_{k−1} = m·F − amortização·m(m−1)/2
  const jurosPagos = i * (m * financiado - (amortizacao * m * (m - 1)) / 2);
  const amortizado = amortizacao * m;
  return {
    financiado,
    taxaMensal: i,
    prazo: n,
    parcelasPagas: m,
    primeiraParcela: financiado > 0 ? amortizacao + i * financiado : 0,
    totalParcelas: amortizado + jurosPagos,
    jurosPagos,
    amortizado,
    saldoDevedor: Math.max(0, financiado - amortizado),
  };
}

/**
 * Parcelamento da própria fonte (leilão judicial, CPC art. 895): o saldo em n parcelas mensais iguais, cada
 * uma corrigida pelo índice até o mês em que vence (parcela k = saldo ÷ n × (1 + i)^k). Na venda, o que falta
 * pagar é quitado já corrigido. A "correção" (jurosPagos) é tudo o que se paga além do saldo nominal.
 */
export function parcelamentoFonte(saldo: number, correcaoAA: number, parcelas: number, meses: number): Omit<ResultadoFinanciamento, "entrada" | "tipo"> {
  const i = taxaMensal(correcaoAA);
  const n = Math.max(1, Math.round(parcelas));
  const m = Math.min(Math.max(0, Math.round(meses)), n);
  const base = saldo / n;
  // Σ_{k=1..m} (1 + i)^k
  const fator = i === 0 ? m : ((1 + i) * (Math.pow(1 + i, m) - 1)) / i;
  const totalParcelas = base * fator;
  const saldoDevedor = base * (n - m) * Math.pow(1 + i, m);
  return {
    financiado: saldo,
    taxaMensal: i,
    prazo: n,
    parcelasPagas: m,
    primeiraParcela: saldo > 0 ? base * (1 + i) : 0,
    totalParcelas,
    jurosPagos: totalParcelas + saldoDevedor - saldo,
    amortizado: base * m,
    saldoDevedor,
  };
}

export function roiAoAno(roi: number, meses: number): number {
  if (roi <= -1) return -1;
  return Math.pow(1 + roi, 12 / meses) - 1;
}

export function roiAoMes(roi: number, meses: number): number {
  if (roi <= -1) return -1;
  return Math.pow(1 + roi, 1 / meses) - 1;
}

/** Custo da reforma (ou limpeza/adequações) com as premissas atuais. */
export function custoReforma(p: Pick<Premissas, "reformaModo" | "reformaUnitario" | "area">): number {
  return p.reformaModo === "m2" ? p.reformaUnitario * p.area : p.reformaUnitario;
}

/** IPTU (ou ITR) por mês: o valor por ano que a pessoa informou, ou % ao ano sobre a avaliação (sem ela, sobre o lance). */
export function iptuMensal(modelo: Pick<Modelo, "entrada">, p: Pick<Premissas, "iptuPct" | "iptuAnual">, lance: number): number {
  if (p.iptuAnual !== null) return p.iptuAnual / 12;
  const av = modelo.entrada.avaliacao;
  const base = av !== null && av > 0 ? av : lance;
  return (p.iptuPct * base) / 12;
}

/** Base do ITBI para um lance: o lance, a avaliação (sem ela, o lance) ou o maior dos dois. */
export function baseItbi(modelo: Pick<Modelo, "entrada">, p: Pick<Premissas, "itbiBase">, lance: number): number {
  const av = modelo.entrada.avaliacao;
  if (p.itbiBase === "lance" || av === null || !(av > 0)) return lance;
  return p.itbiBase === "avaliacao" ? av : Math.max(lance, av);
}

/** A linha está na conta (não foi tirada pela pessoa)? */
export function ligada(p: Pick<Premissas, "desligados">, linha: LinhaDesligavel): boolean {
  return !p.desligados.includes(linha);
}

/** Simula um lance num cenário e prazo. `null` quando falta o valor de venda. */
export function simular(modelo: Modelo, lance: number, cenario: Cenario, meses: number, premissas?: Premissas): Simulacao | null {
  const p = premissas ?? modelo.premissas;
  if (p.valorVenda === null) return null;
  const L = Math.max(0, lance);
  const liga = (linha: LinhaDesligavel) => ligada(p, linha);

  const venda = p.valorVenda * multiplicador(p, cenario);
  // cada custo pela fórmula (%), ou pelo valor em reais que a pessoa informou (a guia, o orçamento)
  const corretagem = liga("corretagem") ? (p.corretagemValor ?? p.corretagemPct * venda) : 0;

  const comissao = liga("comissao") ? (p.comissaoValor ?? p.comissaoPct * L) : 0;
  const itbi = liga("itbi") ? (p.itbiValor ?? p.itbiPct * baseItbi(modelo, p, L)) : 0;
  const registro = liga("registro") ? (p.registroValor ?? Math.max(p.registroPct * L, p.registroMin)) : 0;
  const reserva = liga("reserva") ? (p.reservaValor ?? p.reservaPct * L) : 0;
  const aquisicao = comissao + itbi + registro + reserva;

  const desocupacao = liga("desocupacao") ? p.desocupacao : 0;
  const dividas = liga("dividas") ? p.dividas : 0;
  const reforma = liga("reforma") ? custoReforma(p) : 0;

  const fin: ResultadoFinanciamento | null =
    p.parcelar && modelo.podeParcelar
      ? { tipo: "fonte", entrada: p.parcelasEntradaPct * L, ...parcelamentoFonte(L - p.parcelasEntradaPct * L, p.parcelasCorrecaoAA, p.parcelasN, meses) }
      : p.financiar && modelo.podeFinanciar
        ? { tipo: "banco", entrada: p.entradaPct * L, ...sac(L - p.entradaPct * L, p.jurosAA, p.prazoFinanciamento, meses) }
        : null;

  const extras: ExtraSimulado[] = p.custosExtras
    .filter((x) => liga(`extra:${x.id}`))
    .map((x) => ({
      id: x.id,
      nome: x.nome,
      modo: x.modo,
      parametro: x.valor,
      valor: x.modo === "fixo" ? x.valor : x.modo === "pct_lance" ? x.valor * L : x.valor * meses,
    }));
  const extrasTotal = extras.reduce((t, x) => t + x.valor, 0);

  const mensal = {
    condominio: liga("condominio") ? p.condominio : 0,
    iptu: liga("iptu") ? iptuMensal(modelo, p, L) : 0,
    contas: liga("contas") ? p.contas : 0,
    seguros: fin?.tipo === "banco" && fin.financiado > 0 ? p.segurosMensal : 0,
    extras: extras.filter((x) => x.modo === "mensal").reduce((t, x) => t + x.parametro, 0),
    total: 0,
  };
  mensal.total = mensal.condominio + mensal.iptu + mensal.contas + mensal.seguros + mensal.extras;
  // cada custo mensal corre até vender, ou pelos meses que a pessoa definiu (nunca além da venda: depois dela,
  // o custo é do comprador; uma coluna de 6 meses não paga 12 meses de condomínio)
  const mesesCusto = {
    condominio: Math.min(meses, p.mesesCondominio ?? meses),
    iptu: Math.min(meses, p.mesesIptu ?? meses),
    contas: Math.min(meses, p.mesesContas ?? meses),
  };
  const custosMensais =
    mensal.condominio * mesesCusto.condominio +
    mensal.iptu * mesesCusto.iptu +
    mensal.contas * mesesCusto.contas +
    mensal.seguros * (fin ? fin.parcelasPagas : 0);

  const ganhoCapital = venda - corretagem - L - comissao - itbi - registro - reforma;
  const ir = liga("ir") && !p.irIsento ? Math.max(0, p.irPct * ganhoCapital) : 0;

  const custosProprios = aquisicao + desocupacao + dividas + reforma + custosMensais + extrasTotal;
  const pagoPeloImovel = fin ? fin.entrada + fin.totalParcelas + fin.saldoDevedor : L;
  const lucro = venda - corretagem - ir - pagoPeloImovel - custosProprios;
  const capital = (fin ? fin.entrada + fin.totalParcelas : L) + custosProprios;
  // capital nunca é zero na prática (há o registro mínimo); o piso de R$ 1 só evita dividir por zero
  const roi = lucro / Math.max(capital, 1);

  return {
    lance: L,
    meses,
    cenario,
    venda,
    corretagem,
    ganhoCapital,
    ir,
    comissao,
    itbi,
    registro,
    reserva,
    aquisicao,
    desocupacao,
    dividas,
    reforma,
    mensal,
    mesesCusto,
    custosMensais,
    extras,
    extrasTotal,
    financiamento: fin,
    lucro,
    lucroAno: (lucro * 12) / meses,
    capital,
    roi,
    roiAA: roiAoAno(roi, meses),
    roiAM: roiAoMes(roi, meses),
    rendimentoAplicacao: capital * (Math.pow(1 + p.aplicacaoAA, meses / 12) - 1),
  };
}

/**
 * "Lance + custos = total", em reais inteiros que fecham a soma (rodada 6: o cartão "Seu lance máximo", a linha
 * "Considerado com despesas" do "Meu lance" e o resumo da conta fechada).
 *
 *   custos = tudo o que se paga até vender, além do lance: compra (comissão, ITBI, registro, reserva), desocupação e
 *            dívidas, reforma, os meses até vender (com os seguros do banco), os custos criados e, a prazo, os juros
 *            (ou a correção das parcelas). Cada um com os ajustes da pessoa (linha tirada entra como zero).
 *   total  = lance + custos. À vista, é o dinheiro investido (`capital`, o mesmo número do "Dinheiro investido" da
 *            conta); a prazo, passa dele pelo saldo quitado com o dinheiro da venda (`saldoNaVenda`).
 *
 * A corretagem e o imposto de renda saem do dinheiro da venda (`daVenda`): não entram nos custos, mas entram no
 * lucro e, portanto, no lance máximo.
 */
export interface LanceMaisCustos {
  lance: number;
  custos: number;
  total: number;
  /** a prazo: o total inclui o saldo quitado na venda; à vista, false (total = dinheiro investido) */
  aPrazo: boolean;
  saldoNaVenda: number;
  daVenda: number;
}

export function lanceMaisCustos(s: Simulacao): LanceMaisCustos {
  const fin = s.financiamento;
  const lance = Math.round(s.lance);
  // à vista, o total é o capital já arredondado (o "Dinheiro investido" da conta); os custos são a diferença, e a
  // soma fecha no real
  const total = fin ? Math.round(s.lance + s.aquisicao + s.desocupacao + s.dividas + s.reforma + s.custosMensais + s.extrasTotal + fin.jurosPagos) : Math.round(s.capital);
  return {
    lance,
    custos: total - lance,
    total,
    aPrazo: !!fin,
    saldoNaVenda: fin ? Math.round(fin.saldoDevedor) : 0,
    daVenda: Math.round(s.corretagem + s.ir),
  };
}

/** A simulação atinge a meta? */
export function atingeMeta(s: Simulacao, meta: Meta): boolean {
  switch (meta.tipo) {
    case "roi_aa":
      return s.roiAA >= meta.valor;
    case "roi_periodo":
      return s.roi >= meta.valor;
    case "roi_am":
      return s.roiAM >= meta.valor;
    case "lucro":
      return s.lucro >= meta.valor;
  }
}

/**
 * Maior lance inteiro (R$) que ainda atinge a meta, com precisão de R$ 1: busca binária, porque o retorno
 * cai quando o lance sobe. `null` quando nem o lance zero atinge (ou falta o valor de venda).
 */
export function lanceMaximo(modelo: Modelo, cenario: Cenario, meses: number, meta: Meta, premissas?: Premissas): number | null {
  const ok = (L: number) => {
    const s = simular(modelo, L, cenario, meses, premissas);
    return s !== null && atingeMeta(s, meta);
  };
  if (!ok(0)) return null;
  const p = premissas ?? modelo.premissas;
  let lo = 0;
  let hi = Math.max(1, Math.ceil((p.valorVenda ?? 0) * multiplicador(p, cenario)) + 1);
  while (ok(hi)) {
    lo = hi;
    hi *= 2;
    if (hi > TETO_BUSCA) return lo;
  }
  while (hi - lo > 1) {
    const meio = Math.floor((lo + hi) / 2);
    if (ok(meio)) lo = meio;
    else hi = meio;
  }
  return lo;
}

/** id do custo de teste da margem de segurança (não colide com os criados pela pessoa: eles não têm "_"). */
const ID_MARGEM = "_margem";

/**
 * Margem de segurança de uma compra a preço fixo (venda direta, em que o preço não sobe): o maior custo
 * imprevisto, em reais e de uma vez só, que ainda deixa a meta ser atingida com este lance. Entra como um custo
 * criado (não abate o IR: conservador). Busca binária com precisão de R$ 1, porque o retorno cai quando o custo
 * sobe. `null` quando nem sem imprevisto a meta é atingida (ou falta o valor de venda).
 */
export function margemDeCusto(modelo: Modelo, lance: number, cenario: Cenario, meses: number, meta: Meta): number | null {
  const p = modelo.premissas;
  const com = (c: number): Premissas => ({ ...p, custosExtras: [...p.custosExtras, { id: ID_MARGEM, nome: "imprevisto", modo: "fixo", valor: c }] });
  const ok = (c: number) => {
    const s = simular(modelo, lance, cenario, meses, c === 0 ? p : com(c));
    return s !== null && atingeMeta(s, meta);
  };
  if (!ok(0)) return null;
  let lo = 0;
  let hi = Math.max(1, Math.ceil((p.valorVenda ?? 0) * multiplicador(p, cenario)) + 1);
  while (ok(hi)) {
    lo = hi;
    hi *= 2;
    if (hi > TETO_BUSCA) return lo;
  }
  while (hi - lo > 1) {
    const meio = Math.floor((lo + hi) / 2);
    if (ok(meio)) lo = meio;
    else hi = meio;
  }
  return lo;
}

export interface CelulaMatriz {
  cenario: Cenario;
  meses: number;
  /** lance máximo para a meta (null: nenhum lance atinge) */
  teto: number | null;
  /** simulação com o lance escolhido pela pessoa */
  comMeuLance: Simulacao;
  /**
   * venda direta (preço fixo): a margem de segurança pelo preço pedido (`margemDeCusto`); null: nem sem imprevisto
   * a meta é atingida. Ausente fora da venda direta.
   */
  margem?: number | null;
}

/**
 * Matriz cenários × prazos. `null` quando falta o valor de venda. Linhas: os três cenários e o personalizado,
 * se houver; colunas: os prazos da pessoa (ou os informados, que podem incluir o prazo escolhido no cartão).
 * Com `margemPeloPreco` (venda direta), cada célula traz também a margem de segurança comprando por esse preço.
 */
export function matriz(
  modelo: Modelo,
  meta: Meta,
  meuLance: number,
  colunas: readonly number[] = modelo.premissas.prazos,
  linhas: readonly Cenario[] = cenariosDaMatriz(modelo.premissas),
  margemPeloPreco: number | null = null,
): CelulaMatriz[][] | null {
  if (modelo.premissas.valorVenda === null) return null;
  return linhas.map((cenario) =>
    colunas.map((meses) => ({
      cenario,
      meses,
      teto: lanceMaximo(modelo, cenario, meses, meta),
      comMeuLance: simular(modelo, meuLance, cenario, meses)!,
      ...(margemPeloPreco !== null ? { margem: margemDeCusto(modelo, margemPeloPreco, cenario, meses, meta) } : {}),
    })),
  );
}

/** Uma etapa da cascata venda → lucro. */
export interface Etapa {
  chave: string;
  rotulo: string;
  /** detalhe curto ("6% da venda", "12 meses × R$ 940") */
  detalhe?: string;
  /** valor com sinal: venda positiva, custos negativos; o total final é o lucro */
  valor: number;
  total?: boolean;
}

/**
 * Cascata da venda ao lucro, na ordem da tela; etapas zeradas saem (menos a venda e o lucro).
 * `rotuloReforma` segue o tipo do imóvel ("Limpeza e cercamento" no terreno, "Adequações" no rural); `rotuloLance`,
 * a modalidade ("Preço" na venda direta).
 */
export function cascata(s: Simulacao, rotuloReforma = "Reforma", rotuloLance = "Lance"): Etapa[] {
  const fin = s.financiamento;
  const etapas: Etapa[] = [
    { chave: "venda", rotulo: "Venda", valor: s.venda },
    { chave: "corretagem", rotulo: "Corretagem", valor: -s.corretagem },
    { chave: "ir", rotulo: "Imposto de renda", valor: -s.ir },
    { chave: "lance", rotulo: rotuloLance, valor: -s.lance },
    { chave: "juros", rotulo: fin?.tipo === "fonte" ? "Correção das parcelas" : "Juros do financiamento", valor: fin ? -fin.jurosPagos : 0 },
    { chave: "aquisicao", rotulo: "Custos da compra", valor: -s.aquisicao },
    { chave: "regularizacao", rotulo: "Desocupação e dívidas", valor: -(s.desocupacao + s.dividas) },
    { chave: "reforma", rotulo: rotuloReforma, valor: -s.reforma },
    { chave: "mensais", rotulo: "Custos até vender", valor: -s.custosMensais },
    { chave: "extras", rotulo: s.extras.length === 1 ? s.extras[0]!.nome : "Outros custos", valor: -s.extrasTotal },
    { chave: "lucro", rotulo: s.lucro >= 0 ? "Lucro" : "Prejuízo", valor: s.lucro, total: true },
  ];
  return etapas.filter((e) => e.total || e.chave === "venda" || Math.abs(e.valor) >= 0.5);
}

/** Onde cada barra da cascata começa e termina: a venda parte do zero, cada custo desce do acumulado, o lucro volta ao zero. */
export function posicoesCascata(etapas: readonly Etapa[]): { etapa: Etapa; de: number; ate: number }[] {
  const saida: { etapa: Etapa; de: number; ate: number }[] = [];
  let acumulado = 0;
  for (const etapa of etapas) {
    if (etapa.chave === "venda" || etapa.total) {
      saida.push({ etapa, de: 0, ate: etapa.valor });
      acumulado = etapa.valor;
    } else {
      saida.push({ etapa, de: acumulado, ate: acumulado + etapa.valor });
      acumulado += etapa.valor;
    }
  }
  return saida;
}

/**
 * Contas do simulador. Funções puras (sem React, sem "@/"), testadas em calculo.test.ts.
 *
 *   venda               = valor de referência × % do cenário
 *   aquisição           = comissão + ITBI + escritura/registro (máx. de % e piso) + reserva, tudo sobre o lance
 *   regularização       = desocupação + dívidas que passam ao comprador
 *   reforma             = R$/m² × área (construídos) ou valor fixo (terreno, rural)
 *   custos mensais      = (condomínio + IPTU/ITR + contas) × meses  [+ seguros do financiamento]
 *   IR                  = alíquota × (venda − corretagem − lance − comissão − ITBI − registro − reforma), só se > 0
 *   lucro               = venda − corretagem − IR − lance − aquisição − regularização − reforma − custos mensais
 *                         (financiado: − juros pagos − seguros; o saldo devedor é quitado com a venda)
 *   capital             = dinheiro próprio até a venda (à vista: lance + custos; financiado: entrada + parcelas + custos)
 *   ROI no período      = lucro ÷ capital;  ROI ao ano = (1 + ROI)^(12/meses) − 1
 *
 * O lucro cai e o capital sobe quando o lance sobe; por isso o ROI cai com o lance enquanto o lucro é ≥ 0, e o
 * lance máximo para uma meta ≥ 0 sai por busca binária.
 */
import { multiplicador, type Modelo } from "./premissas";
import { CENARIOS, type Cenario, type Meta, type Premissas, type ResultadoFinanciamento, type Simulacao } from "./tipos";

/** Taxa mensal equivalente a uma taxa anual: (1 + a.a.)^(1/12) − 1. */
export function taxaMensal(aa: number): number {
  return Math.pow(1 + aa, 1 / 12) - 1;
}

/**
 * Financiamento pela tabela SAC (amortização constante), quitado na venda.
 * Parcela do mês k = amortização + juros sobre o saldo do mês anterior.
 */
export function sac(financiado: number, jurosAA: number, prazo: number, meses: number): Omit<ResultadoFinanciamento, "entrada"> {
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

export function roiAoAno(roi: number, meses: number): number {
  if (roi <= -1) return -1;
  return Math.pow(1 + roi, 12 / meses) - 1;
}

/** Custo da reforma (ou limpeza/adequações) com as premissas atuais. */
export function custoReforma(modelo: Pick<Modelo, "perfil">, p: Premissas): number {
  return modelo.perfil.modoReforma === "m2" ? p.reformaUnitario * p.area : p.reformaUnitario;
}

/** IPTU (ou ITR) por mês: % ao ano sobre a avaliação; sem avaliação, sobre o lance. */
export function iptuMensal(modelo: Pick<Modelo, "entrada">, p: Premissas, lance: number): number {
  const av = modelo.entrada.avaliacao;
  const base = av !== null && av > 0 ? av : lance;
  return (p.iptuPct * base) / 12;
}

/** Simula um lance num cenário e prazo. `null` quando falta o valor de venda. */
export function simular(modelo: Modelo, lance: number, cenario: Cenario, meses: number, premissas?: Premissas): Simulacao | null {
  const p = premissas ?? modelo.premissas;
  if (p.valorVenda === null) return null;
  const L = Math.max(0, lance);

  const venda = p.valorVenda * multiplicador(p, cenario);
  const corretagem = p.corretagemPct * venda;

  const comissao = p.comissaoPct * L;
  const itbi = p.itbiPct * L;
  const registro = Math.max(p.registroPct * L, p.registroMin);
  const reserva = p.reservaPct * L;
  const aquisicao = comissao + itbi + registro + reserva;

  const desocupacao = p.desocupacao;
  const dividas = p.dividas;
  const reforma = custoReforma(modelo, p);

  const fin = p.financiar && modelo.podeFinanciar ? { entrada: p.entradaPct * L, ...sac(L - p.entradaPct * L, p.jurosAA, p.prazoFinanciamento, meses) } : null;

  const mensal = {
    condominio: p.condominio,
    iptu: iptuMensal(modelo, p, L),
    contas: p.contas,
    seguros: fin && fin.financiado > 0 ? p.segurosMensal : 0,
    total: 0,
  };
  mensal.total = mensal.condominio + mensal.iptu + mensal.contas + mensal.seguros;
  const custosMensais = (mensal.condominio + mensal.iptu + mensal.contas) * meses + mensal.seguros * (fin ? fin.parcelasPagas : 0);

  const ganhoCapital = venda - corretagem - L - comissao - itbi - registro - reforma;
  const ir = Math.max(0, p.irPct * ganhoCapital);

  const custosProprios = aquisicao + desocupacao + dividas + reforma + custosMensais;
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
    custosMensais,
    financiamento: fin,
    lucro,
    capital,
    roi,
    roiAA: roiAoAno(roi, meses),
    rendimentoAplicacao: capital * (Math.pow(1 + p.aplicacaoAA, meses / 12) - 1),
  };
}

/** A simulação atinge a meta? */
export function atingeMeta(s: Simulacao, meta: Meta): boolean {
  switch (meta.tipo) {
    case "roi_aa":
      return s.roiAA >= meta.valor;
    case "roi_periodo":
      return s.roi >= meta.valor;
    case "lucro":
      return s.lucro >= meta.valor;
  }
}

const TETO_BUSCA = 1e11;

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

export interface CelulaMatriz {
  cenario: Cenario;
  meses: number;
  /** lance máximo para a meta (null: nenhum lance atinge) */
  teto: number | null;
  /** simulação com o lance escolhido pela pessoa */
  comMeuLance: Simulacao;
}

/** Matriz cenários × prazos. `null` quando falta o valor de venda. */
export function matriz(modelo: Modelo, meta: Meta, meuLance: number): CelulaMatriz[][] | null {
  if (modelo.premissas.valorVenda === null) return null;
  return CENARIOS.map((cenario) =>
    modelo.premissas.prazos.map((meses) => ({
      cenario,
      meses,
      teto: lanceMaximo(modelo, cenario, meses, meta),
      comMeuLance: simular(modelo, meuLance, cenario, meses)!,
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
 * `rotuloReforma` segue o tipo do imóvel ("Limpeza e cercamento" no terreno, "Adequações" no rural).
 */
export function cascata(s: Simulacao, rotuloReforma = "Reforma"): Etapa[] {
  const fin = s.financiamento;
  const etapas: Etapa[] = [
    { chave: "venda", rotulo: "Venda", valor: s.venda },
    { chave: "corretagem", rotulo: "Corretagem", valor: -s.corretagem },
    { chave: "ir", rotulo: "Imposto de renda", valor: -s.ir },
    { chave: "lance", rotulo: "Lance", valor: -s.lance },
    { chave: "juros", rotulo: "Juros do financiamento", valor: fin ? -fin.jurosPagos : 0 },
    { chave: "aquisicao", rotulo: "Custos da compra", valor: -s.aquisicao },
    { chave: "regularizacao", rotulo: "Desocupação e dívidas", valor: -(s.desocupacao + s.dividas) },
    { chave: "reforma", rotulo: rotuloReforma, valor: -s.reforma },
    { chave: "mensais", rotulo: "Custos até vender", valor: -s.custosMensais },
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

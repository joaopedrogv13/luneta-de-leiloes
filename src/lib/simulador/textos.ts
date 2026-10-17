/**
 * Textos curtos do simulador que a tela e o relatório em PDF dividem (sem React, sem "@/").
 */
import { multiplicador, type Modelo } from "./premissas";
import { meses as mesesTexto, moeda, pct } from "./formato";
import type { Cenario, EntradaSimulador, Meta, Premissas, TipoMeta } from "./tipos";

/**
 * Venda direta: preço fixo, sem disputa (leva quem formaliza primeiro a proposta pelo preço pedido). O simulador
 * troca a pergunta: em vez de "até quanto dar de lance", "vale a pena comprar por este preço" (o lucro grande e
 * a margem de segurança para custos imprevistos).
 */
export function semDisputa(e: Pick<EntradaSimulador, "modalidade">): boolean {
  return e.modalidade === "venda_direta";
}

/** As palavras do preço de compra: "lance mínimo" e "lance" num leilão; "preço pedido" e "preço" na venda direta. */
export function palavrasPreco(e: Pick<EntradaSimulador, "modalidade">) {
  const fixo = semDisputa(e);
  return {
    fixo,
    minimo: fixo ? "preço pedido" : "lance mínimo",
    Minimo: fixo ? "Preço pedido" : "Lance mínimo",
    lance: fixo ? "preço" : "lance",
    Lance: fixo ? "Preço" : "Lance",
  };
}

/**
 * Como o lucro trata o imposto de renda, conforme a premissa: "já sem o IR"; "com isenção do IR"; ou, com a linha
 * tirada da conta, "sem descontar o IR (você tirou da conta)". `longo` escreve "imposto de renda" por extenso.
 */
export function notaIr(p: Pick<Premissas, "desligados" | "irIsento">, longo = false): string {
  const ir = longo ? "o imposto de renda" : "o IR";
  if (p.desligados.includes("ir")) return `sem descontar ${ir} (você tirou da conta)`;
  if (p.irIsento) return longo ? "com a isenção do imposto de renda que você indicou" : "com isenção do IR";
  return `já sem ${ir}`;
}

export const CENARIO_ROTULO: Record<Cenario, string> = {
  conservador: "Conservador",
  base: "Base",
  otimista: "Otimista",
  personalizado: "Personalizado",
};

/** O que cada cenário quer dizer, para leigo. */
export const CENARIO_EXPLICA: Record<Cenario, string> = {
  conservador: "vende abaixo do valor de referência (mercado mais fraco, pressa para vender)",
  base: "vende pelo valor de referência",
  otimista: "vende acima do valor de referência (imóvel reformado, mercado aquecido)",
  personalizado: "o valor de venda que você definir",
};

export const PERIODO_META: Record<Exclude<TipoMeta, "lucro">, string> = {
  roi_periodo: "no total",
  roi_aa: "ao ano",
  roi_am: "ao mês",
};

/** A meta por extenso ("20% ao ano", "1,5% ao mês", "30% no total", "R$ 50.000 de lucro"). */
export function metaPorExtenso(m: Meta): string {
  if (m.tipo === "lucro") return `${moeda(m.valor)} de lucro`;
  return `${pct(m.valor, m.valor < 0.1 && m.valor * 1000 !== Math.round(m.valor * 1000) ? 2 : 1)} ${PERIODO_META[m.tipo]}`;
}

/** A meta como objetivo ("ganhar R$ 50.000", "render 20% ao ano"). */
export function metaComoObjetivo(m: Meta): string {
  return m.tipo === "lucro" ? `ganhar ${moeda(m.valor)}` : `render ${metaPorExtenso(m)}`;
}

/** De onde vem o valor de venda, curto ("da avaliação", "da referência da região", "do valor que você informou"). */
export function baseDaVenda(modelo: Pick<Modelo, "origemVenda">): string {
  const o = modelo.origemVenda;
  if (o.tipo === "avaliacao") return "da avaliação";
  if (o.tipo === "referencia") return "da referência da região";
  return "do valor que você informou";
}

/** "100% da avaliação", "R$ 230.000 (personalizado)". */
export function vendaDoCenario(modelo: Modelo, cenario: Cenario): string {
  const p = modelo.premissas;
  if (cenario === "personalizado" && p.vendaPersonalizada?.modo === "valor") return `${moeda(p.vendaPersonalizada.valor)}, valor que você definiu`;
  return `${pct(multiplicador(p, cenario), 0)} ${baseDaVenda(modelo)}`;
}

/**
 * De onde vem a venda, para ir entre parênteses logo depois do valor: "por R$ 251.000 (100% da avaliação)" e, no
 * personalizado em reais, "por R$ 150.000 (valor que você definiu)", sem repetir o valor.
 */
export function vendaDoCenarioCurta(modelo: Modelo, cenario: Cenario): string {
  const p = modelo.premissas;
  if (cenario === "personalizado" && p.vendaPersonalizada?.modo === "valor") return "valor que você definiu";
  return vendaDoCenario(modelo, cenario);
}

/** Converte uma meta em % para outro período, pelo mesmo rendimento (juros compostos), dado o prazo de venda. */
export function converterMeta(m: Meta, para: Exclude<TipoMeta, "lucro">, meses: number): Meta {
  if (m.tipo === "lucro" || m.tipo === para) return { tipo: para, valor: m.tipo === "lucro" ? 0.2 : m.valor };
  // tudo para "ao mês" e de volta
  const am = m.tipo === "roi_am" ? m.valor : m.tipo === "roi_aa" ? Math.pow(1 + m.valor, 1 / 12) - 1 : Math.pow(1 + m.valor, 1 / meses) - 1;
  const v = para === "roi_am" ? am : para === "roi_aa" ? Math.pow(1 + am, 12) - 1 : Math.pow(1 + am, meses) - 1;
  // arredonda para algo que se digita: 0,1 ponto percentual (0,01 abaixo de 2%)
  const passo = v < 0.02 ? 1e-4 : 1e-3;
  return { tipo: para, valor: Math.max(0, Math.round(v / passo) * passo) };
}

/** "em 12 meses" ou "em 1 mês". */
export function emMeses(n: number): string {
  return `em ${mesesTexto(n)}`;
}

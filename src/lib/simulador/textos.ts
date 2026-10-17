/**
 * Textos curtos do simulador que a tela e o relatório em PDF dividem (sem React, sem "@/").
 */
import { multiplicador, type Modelo } from "./premissas";
import { meses as mesesTexto, moeda, pct } from "./formato";
import type { Cenario, Meta, TipoMeta } from "./tipos";

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

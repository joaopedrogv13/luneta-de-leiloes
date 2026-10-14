import { area as areaCatalogo, moeda as moedaCatalogo, moedaCurta as moedaCurtaCatalogo } from "@/lib/catalogo/rotulos";
import type { TipoImovel } from "@/lib/catalogo/tipos";

/** "R$ 1.234" com espaço que não quebra: "R$" nunca fica sozinho no fim da linha. */
export function moeda(v: number, centavos = false): string {
  return moedaCatalogo(v, centavos).replace(/ /g, "\u00a0");
}

const PCT0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const PCT1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const NUM1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const NUM0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const NUM2 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

/** "R$ 3 mil" sem quebrar a linha entre o número e a unidade. */
export function moedaCurta(v: number): string {
  return moedaCurtaCatalogo(v).replace(/ /g, "\u00a0");
}

/**
 * Área com as casas que a conta usa ("62,4 m²"): a reforma e o condomínio multiplicam a área exata, então
 * mostrar "62 m²" deixava "R$ 350 × 62 m² = R$ 21.840" sem fechar. Áreas rurais grandes seguem em hectares.
 */
export function area(m2: number): string {
  if (m2 >= 100_000) return areaCatalogo(m2);
  return `${NUM2.format(m2)}\u00a0m²`;
}

/** Preço por área: "R$ 4.567/m²"; no rural, por hectare ("R$ 108.333/ha"), que é como o mercado fala. */
export function porArea(valorM2: number, tipo: TipoImovel): string {
  return tipo === "rural" ? `${moeda(Math.round(valorM2 * 10_000))}/ha` : `${moeda(Math.round(valorM2))}/m²`;
}

/** Valor mensal: com centavos só quando há centavos (IPTU de R$ 237,50), para a conta "× meses" fechar. */
export function moedaMes(v: number): string {
  return Math.abs(v - Math.round(v)) < 0.005 ? moeda(Math.round(v)) : moeda(v, true);
}

/** 0.246 → "24,6%"; a partir de 100%, sem decimal ("1.240%"). */
export function pct(fracao: number, casas: 0 | 1 = 1): string {
  const v = fracao * 100;
  const f = casas === 0 || Math.abs(v) >= 100 ? PCT0 : PCT1;
  return `${f.format(v).replace("-", "−")}%`;
}

/** Moeda com sinal tipográfico: "−R$ 18.000", "+R$ 3.000" (só quando `mais`). */
export function moedaSinal(v: number, mais = false): string {
  const r = Math.round(v);
  if (r < 0) return `−${moeda(-r)}`;
  return `${mais && r > 0 ? "+" : ""}${moeda(r)}`;
}

/**
 * Valor curto para a matriz, sem "R$" (o cabeçalho diz a unidade): "182 mil", "1,2 mi", "900", "−8 mil".
 */
export function curto(v: number): string {
  const sinal = v < 0 ? "−" : "";
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${sinal}${NUM1.format(a / 1_000_000)}\u00a0mi`;
  if (a >= 10_000) return `${sinal}${NUM0.format(a / 1000)}\u00a0mil`;
  if (a >= 1000) return `${sinal}${NUM1.format(a / 1000)}\u00a0mil`;
  return `${sinal}${NUM0.format(a)}`;
}

/** "12 meses", "1 mês" */
export function meses(n: number): string {
  return `${n}\u00a0${n === 1 ? "mês" : "meses"}`;
}

/** "−R$ 8 mil", "R$ 52 mil" */
export function moedaCurtaSinal(v: number): string {
  return v < 0 ? `−${moedaCurta(-v)}` : moedaCurta(v);
}

/** "a", "a e b", "a, b e c" */
export function juntar(itens: readonly string[]): string {
  if (itens.length <= 1) return itens.join("");
  return `${itens.slice(0, -1).join(", ")} e ${itens.at(-1)}`;
}

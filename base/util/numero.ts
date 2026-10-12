/**
 * Números no formato brasileiro: "1.234,56", "R$ 50.074,26", "66,62%", "600,00m2".
 */

export interface OpcoesNumero {
  /**
   * Separador decimal. "auto" (padrão) decide pela forma: com vírgula, a vírgula é decimal;
   * só com pontos, "1.234" e "1.234.567" são milhar e "66.62" ou "600.00" são decimais.
   * Use "." para colunas que a fonte escreve com ponto decimal (ex.: "Desconto" da Caixa).
   */
  decimal?: "," | "." | "auto";
}

/**
 * Lê um número em pt-BR. Ignora "R$", "%", "m²", espaços e texto ao redor do primeiro número.
 * Devolve `null` para vazio, "-", "não informado" ou valor ilegível.
 *
 *   lerNumeroBR("1.234,56")        → 1234.56
 *   lerNumeroBR("R$ 1.700.000,00") → 1700000
 *   lerNumeroBR("66.62")           → 66.62
 *   lerNumeroBR("1.234")           → 1234
 *   lerNumeroBR("-12,5")           → -12.5
 */
export function lerNumeroBR(valor: unknown, opcoes: OpcoesNumero = {}): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor !== "string") return null;
  const achado = /-?\s*\d[\d.,]*/.exec(valor.replace(/ /g, " "));
  if (!achado) return null;
  let bruto = achado[0].replace(/\s+/g, "");
  const negativo = bruto.startsWith("-");
  if (negativo) bruto = bruto.slice(1);
  bruto = bruto.replace(/[.,]+$/, "");
  if (bruto === "") return null;

  const decimal = opcoes.decimal ?? "auto";
  let normal: string;
  if (decimal === ",") {
    normal = bruto.replace(/\./g, "").replace(",", ".");
  } else if (decimal === ".") {
    normal = bruto.replace(/,/g, "");
  } else if (bruto.includes(",")) {
    normal = bruto.replace(/\./g, "").replace(/,(?=.*,)/g, "").replace(",", ".");
  } else {
    const pontos = bruto.split(".").length - 1;
    if (pontos === 0) normal = bruto;
    else if (pontos > 1) normal = bruto.replace(/\./g, "");
    else normal = /^\d{1,3}\.\d{3}$/.test(bruto) ? bruto.replace(".", "") : bruto;
  }
  const numero = Number(normal);
  if (!Number.isFinite(numero)) return null;
  return negativo ? -numero : numero;
}

/** Lê um inteiro ("3 qto(s)" → 3). Devolve `null` se não houver número ou se não for inteiro. */
export function lerInteiro(valor: unknown): number | null {
  const numero = lerNumeroBR(valor);
  if (numero === null || !Number.isInteger(numero)) return null;
  return numero;
}

/** Arredonda para `casas` decimais (padrão 2), evitando 1.005 → 1.00. */
export function arredondar(numero: number, casas = 2): number {
  const fator = 10 ** casas;
  return Math.round((numero + Number.EPSILON) * fator) / fator;
}

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const DECIMAL = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

/** 1234.5 → "R$ 1.234,50" (espaço comum, não o espaço fino do Intl). */
export function formatarMoedaBR(numero: number): string {
  return MOEDA.format(numero).replace(/ /g, " ");
}

/** 1234.5 → "1.234,5". */
export function formatarNumeroBR(numero: number): string {
  return DECIMAL.format(numero);
}

/**
 * Máscara pt-BR dos campos numéricos ("1.234.567", "11,5"). Puro, para testar em Node.
 * O campo guarda só o número; prefixo ("R$") e sufixo ("%", "m²") ficam fora do <input>.
 */

const cache = new Map<number, Intl.NumberFormat>();
function fmt(casas: number) {
  let f = cache.get(casas);
  if (!f) {
    f = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: casas, useGrouping: true });
    cache.set(casas, f);
  }
  return f;
}

/** 1234.5 → "1.234,5" (até `casas` decimais, sem zeros sobrando). */
export function formatarNumero(v: number, casas = 0): string {
  return fmt(casas).format(v);
}

/**
 * Limpa e reagrupa o que a pessoa digitou: só dígitos e uma vírgula (se o campo aceita decimais),
 * pontos de milhar recolocados. Um único ponto seguido de até `casas` dígitos vale como vírgula
 * ("11.5" → "11,5", "2." → "2,"); "1.200" continua sendo mil e duzentos.
 */
export function mascarar(texto: string, casas = 0): string {
  let s = texto.replace(/[^\d.,]/g, "");
  if (casas > 0 && !s.includes(",")) {
    // um único ponto com até `casas` dígitos depois (inclusive nenhum, enquanto digita "2.") é decimal
    const m = s.match(/^(\d*)\.(\d*)$/);
    if (m && m[2].length <= casas && m[2].length !== 3) s = `${m[1]},${m[2]}`;
  }
  s = s.replace(/\./g, "");
  // campo inteiro: o que vem depois da vírgula é centavo/decimal e sai (não vira dígito do inteiro)
  if (casas === 0) s = s.split(",")[0];
  const virgula = casas > 0 ? s.indexOf(",") : -1;
  let inteiro = (virgula >= 0 ? s.slice(0, virgula) : s).replace(/,/g, "");
  const decimal =
    virgula >= 0
      ? s
          .slice(virgula + 1)
          .replace(/,/g, "")
          .slice(0, casas)
      : "";
  inteiro = inteiro.replace(/^0+(?=\d)/, "");
  const agrupado = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  if (virgula >= 0) return `${agrupado || "0"},${decimal}`;
  return agrupado;
}

/** "1.234,5" → 1234.5; vazio ou só vírgula → null. */
export function interpretar(texto: string): number | null {
  const s = texto.replace(/\./g, "").replace(",", ".").trim();
  if (!s || s === ".") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Quantos caracteres "de verdade" (dígitos e vírgula) há antes da posição `pos`. */
function significativos(texto: string, pos: number) {
  let n = 0;
  for (let i = 0; i < Math.min(pos, texto.length); i++) if (/[\d,]/.test(texto[i])) n++;
  return n;
}

/**
 * Onde o cursor deve ficar depois da máscara: com o mesmo número de dígitos à esquerda que tinha antes
 * (assim digitar no meio de "1.234" não joga o cursor para o fim).
 */
export function cursorDepois(bruto: string, posBruta: number, mascarado: string, casas = 0): number {
  // o ponto que virou vírgula ("11.5") conta como significativo
  const ajustado = casas > 0 && !bruto.includes(",") && mascarado.includes(",") ? bruto.replace(/\.(?=\d*$)/, ",") : bruto;
  const alvo = significativos(ajustado, posBruta);
  if (alvo === 0) return 0;
  let n = 0;
  for (let i = 0; i < mascarado.length; i++) {
    if (/[\d,]/.test(mascarado[i])) n++;
    if (n === alvo) return i + 1;
  }
  return mascarado.length;
}

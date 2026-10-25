/**
 * Onde pôr os rótulos curtos das marcas de um deslizante ("mínimo R$ 150 mil", "máximo R$ 182 mil") para que nunca
 * se sobreponham nem saiam da faixa, nem num celular de 360 px (rodada 6, decisão 2). Pura (sem React, sem "@/"),
 * testada em marcas.test.ts.
 *
 * Cada rótulo tenta centrar no seu traço; preso às bordas; se encosta no vizinho, os dois se afastam (o da esquerda
 * para a esquerda, o da direita para a direita), mantendo `folga` px entre eles. Só quando a soma das larguras passa
 * da faixa é que não há como evitar a sobreposição (aí ficam encostados a partir da borda esquerda).
 *
 *   centros  posição de cada traço, em px a partir da esquerda
 *   larguras largura de cada rótulo, em px
 *   faixa    largura disponível, em px
 *   → a posição da esquerda de cada rótulo, na ordem de entrada
 */
/**
 * O fim da régua do "Meu lance", em múltiplos de R$ 1.000: o maior entre 1,6 × o lance mínimo, a maior venda dos
 * cenários e o seu lance máximo com 10% de folga (revisão da rodada 6: num cenário personalizado acima do otimista,
 * o máximo passava do fim da régua e a marca ficava presa na ponta, sem dizer que estava fora da escala).
 */
export function fimDaRegua(lance: number, vendaMax: number, teto: number | null): number {
  const mil = (v: number) => Math.round(v / 1000) * 1000;
  return Math.max(mil(lance * 1.6), mil(vendaMax), teto !== null && teto > 0 ? Math.ceil((teto * 1.1) / 1000) * 1000 : 0, 10_000);
}

export function arrumarRotulos(centros: readonly number[], larguras: readonly number[], faixa: number, folga = 8): number[] {
  const n = centros.length;
  if (n === 0) return [];
  const ordem = centros.map((_, i) => i).sort((a, b) => centros[a]! - centros[b]! || a - b);
  const esq = new Array<number>(n);
  const prender = (v: number, w: number) => Math.min(Math.max(0, faixa - w), Math.max(0, v));
  for (const i of ordem) esq[i] = prender(centros[i]! - larguras[i]! / 2, larguras[i]!);
  // da esquerda para a direita: cada um começa depois do anterior
  for (let k = 1; k < n; k++) {
    const a = ordem[k - 1]!;
    const b = ordem[k]!;
    esq[b] = Math.max(esq[b]!, esq[a]! + larguras[a]! + folga);
  }
  // da direita para a esquerda: o último não passa da faixa e empurra os anteriores
  const ultimo = ordem[n - 1]!;
  esq[ultimo] = Math.min(esq[ultimo]!, faixa - larguras[ultimo]!);
  for (let k = n - 2; k >= 0; k--) {
    const a = ordem[k]!;
    const b = ordem[k + 1]!;
    esq[a] = Math.min(esq[a]!, esq[b]! - folga - larguras[a]!);
  }
  // não coube: encosta a partir da borda esquerda
  if (esq[ordem[0]!]! < 0) {
    let x = 0;
    for (const i of ordem) {
      esq[i] = x;
      x += larguras[i]! + folga;
    }
  }
  return esq;
}

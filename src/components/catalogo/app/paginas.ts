/**
 * Números da paginação ("Anterior 1 2 3 … 52 Próxima"). Funções puras (testadas em paginas.test.ts).
 */

export type ItemPagina = number | "…";

/**
 * Páginas a mostrar: sempre a primeira e a última, a atual e `vizinhas` de cada lado; "…" onde há buraco.
 * O total de posições fica estável (2 × vizinhas + 5) para os botões não pularem ao trocar de página:
 * perto das pontas, entram mais páginas do lado de dentro ("1 2 3 4 5 … 52"). Um buraco de uma página só
 * vira o número dela (nunca "1 … 3").
 */
export function paginasVisiveis(atual: number, total: number, vizinhas = 1): ItemPagina[] {
  const n = Math.max(1, Math.floor(total));
  const p = Math.min(n, Math.max(1, Math.floor(atual)));
  const v = Math.max(0, Math.floor(vizinhas));
  const posicoes = 2 * v + 5;
  if (n <= posicoes) return Array.from({ length: n }, (_, i) => i + 1);

  const intervalo = (de: number, ate: number) => Array.from({ length: ate - de + 1 }, (_, i) => de + i);
  const esq = p - v;
  const dir = p + v;
  // perto do começo: 1 … (sem buraco à esquerda)
  if (esq <= 3) return [...intervalo(1, posicoes - 2), "…", n];
  // perto do fim
  if (dir >= n - 2) return [1, "…", ...intervalo(n - (posicoes - 3), n)];
  return [1, "…", ...intervalo(esq, dir), "…", n];
}

/** "Mostrando 25–48 de 1.234": primeiro e último item da página (1-based); 0–0 sem resultados. */
export function faixaDaPagina(pagina: number, porPagina: number, total: number): { de: number; ate: number } {
  if (total <= 0) return { de: 0, ate: 0 };
  const de = (pagina - 1) * porPagina + 1;
  return { de: Math.min(de, total), ate: Math.min(total, pagina * porPagina) };
}

"use client";

/**
 * Rolagem da página do imóvel, no navegador: a área coberta pelas barras fixas (cabeçalho + navegação das
 * seções no topo, barra do lance no pé do celular) e a "âncora" que mantém a pessoa na mesma seção quando a
 * página troca de plano (Lente ↔ Luneta), já que a seção de riscos muda de altura entre um e outro.
 */

/** Marca o bloco fixo do topo (o que envolve a navegação das seções). */
export const ATTR_TOPO_FIXO = "data-topo-fixo";
/** Marca a barra fixa do pé (celular). */
export const ATTR_BARRA_FIXA = "data-barra-fixa";

/** Folga entre a barra fixa e o item focado. */
export const FOLGA = 16;

/** Até onde (px do topo da janela) o bloco fixo do topo cobre a página quando está colado. */
export function alturaTopoFixo(): number {
  const el = document.querySelector<HTMLElement>(`[${ATTR_TOPO_FIXO}]`);
  if (!el) return 0;
  const css = getComputedStyle(el);
  if (css.position !== "sticky" && css.position !== "fixed") return 0;
  const topo = Number.parseFloat(css.top);
  return Math.round((Number.isFinite(topo) ? topo : 0) + el.offsetHeight);
}

/** Altura da barra fixa do pé (0 quando ela não existe nesta largura). */
export function alturaBarraFixa(): number {
  const el = document.querySelector<HTMLElement>(`[${ATTR_BARRA_FIXA}]`);
  if (!el || getComputedStyle(el).display === "none") return 0;
  return Math.round(el.offsetHeight);
}

/** Linha de leitura: a seção cujo topo passou dela é a "atual" (a navegação marca, a troca de plano mantém). */
export function linhaDeLeitura(): number {
  // o título de uma seção alcançada pela âncora para em topo fixo + folga + 12 px (imovel.module.css)
  return alturaTopoFixo() + FOLGA + 32;
}

/** A seção da página que está à vista agora (a última cujo topo passou da linha de leitura). */
export function secaoAVista(): HTMLElement | null {
  const linha = linhaDeLeitura();
  let achada: HTMLElement | null = null;
  for (const el of document.querySelectorAll<HTMLElement>("[data-secao-imovel]")) {
    if (el.getBoundingClientRect().top <= linha) achada = el;
  }
  return achada;
}

let ancora: { secao: string; topo: number } | null = null;

/** Guarda onde a seção à vista está na tela, antes de a página trocar de plano. */
export function guardarAncora() {
  const el = secaoAVista();
  ancora = el?.dataset.secaoImovel ? { secao: el.dataset.secaoImovel, topo: el.getBoundingClientRect().top } : null;
}

/** Depois da troca: devolve a seção guardada ao mesmo lugar da tela (as seções de cima podem ter mudado de altura). */
export function restaurarAncora() {
  const a = ancora;
  ancora = null;
  if (!a) return;
  const ajustar = () => {
    const el = document.querySelector<HTMLElement>(`[data-secao-imovel="${CSS.escape(a.secao)}"]`);
    if (!el) return;
    const d = el.getBoundingClientRect().top - a.topo;
    if (Math.abs(d) > 1) window.scrollBy({ top: d, behavior: "instant" });
  };
  ajustar();
  // a ancoragem de rolagem do navegador pode mexer de novo no quadro seguinte
  requestAnimationFrame(ajustar);
}

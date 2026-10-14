"use client";

import { useEffect } from "react";
import { alturaBarraFixa, alturaTopoFixo, ATTR_BARRA_FIXA, ATTR_TOPO_FIXO, FOLGA } from "./rolagem";

/** O bloco fixo (cabeçalho ou navegação das seções) está colado no topo da tela agora? */
function colado(el: HTMLElement) {
  const css = getComputedStyle(el);
  if (css.position !== "sticky") return false;
  const topo = Number.parseFloat(css.top);
  return Math.abs(el.getBoundingClientRect().top - (Number.isFinite(topo) ? topo : 0)) < 1.5;
}

/**
 * Nada que recebe o foco (ou o alvo de uma âncora) para sob as barras fixas (WCAG 2.4.11): mede o cabeçalho +
 * a navegação das seções e a barra do lance no pé (celular) e põe essas alturas, com folga, no scroll-padding
 * do <html> (o padrão do site é 72 px, menos que a navegação). Mede de novo quando as barras mudam de tamanho
 * (largura, celular deitado, fonte maior). Ao sair da página, tudo volta ao que era.
 *
 * Efeito colateral do scroll-padding que é corrigido aqui: os itens das próprias barras fixas ficam "dentro" da
 * faixa reservada, e o navegador rolava a página centenas de px ao focá-los com o Tab ("Ver como", as abas
 * das seções). Quando o item já estava à vista, a rolagem volta para onde estava.
 */
export function RolagemSegura() {
  useEffect(() => {
    const html = document.documentElement;
    const antes = { topo: html.style.scrollPaddingTop, pe: html.style.scrollPaddingBottom };
    const medir = () => {
      const pe = alturaBarraFixa();
      html.style.scrollPaddingTop = `${alturaTopoFixo() + FOLGA}px`;
      html.style.scrollPaddingBottom = pe > 0 ? `${pe + FOLGA}px` : antes.pe;
    };

    // a posição antes do foco: o evento de rolagem chega só no quadro seguinte, então no "focusin" este valor
    // ainda é o de antes da rolagem que o foco causou
    let ultimoY = window.scrollY;
    const aoRolar = () => {
      ultimoY = window.scrollY;
    };
    const aoFocar = (e: FocusEvent) => {
      const alvo = e.target;
      if (!(alvo instanceof HTMLElement)) return;
      const fixo = alvo.closest<HTMLElement>(`header, [${ATTR_TOPO_FIXO}]`);
      if (!fixo) return;
      const y = window.scrollY;
      const rolou = Math.abs(y - ultimoY) >= 1;
      if (rolou) window.scrollTo({ top: ultimoY, behavior: "instant" });
      const r = alvo.getBoundingClientRect();
      if (colado(fixo) && r.top >= 0 && r.bottom <= window.innerHeight) {
        // já estava à vista: fica onde estava (e cancela uma rolagem suave que o foco tenha começado)
        if (!rolou) window.scrollTo({ top: y, behavior: "instant" });
        return;
      }
      // estava fora da tela (barra ainda no fluxo da página): a rolagem do navegador vale
      if (rolou) window.scrollTo({ top: y, behavior: "instant" });
    };

    medir();
    const ro = new ResizeObserver(medir);
    for (const el of document.querySelectorAll(`[${ATTR_TOPO_FIXO}], [${ATTR_BARRA_FIXA}], header`)) ro.observe(el);
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", aoRolar, { passive: true });
    document.addEventListener("focusin", aoFocar);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", medir);
      window.removeEventListener("scroll", aoRolar);
      document.removeEventListener("focusin", aoFocar);
      html.style.scrollPaddingTop = antes.topo;
      html.style.scrollPaddingBottom = antes.pe;
    };
  }, []);
  return null;
}

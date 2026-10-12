"use client";

import { useEffect, useLayoutEffect } from "react";

/** Mede todas as seções agora (layout completo); dois quadros depois elas voltam a ser puladas. Devolve o cancelamento. */
function measureAll() {
  const root = document.documentElement;
  root.dataset.cv = "all";
  void root.scrollHeight; // layout completo agora, antes de alguém calcular o destino
  let raf = requestAnimationFrame(() => {
    raf = requestAnimationFrame(() => delete root.dataset.cv);
  });
  return () => {
    cancelAnimationFrame(raf);
    delete root.dataset.cv;
  };
}

/** Só a primeira montagem pode ser a hidratação de um carregamento direto com #âncora. */
let firstMount = true;

/**
 * As seções abaixo da dobra usam content-visibility: auto (globals.css → .section): enquanto estão longe
 * da tela, a altura delas é uma estimativa. Um link interno (#planos, #niveis…) com rolagem suave
 * calcularia o destino com essas estimativas e pararia fora do lugar quando as seções do caminho
 * ganhassem a altura real. Por isso, no clique (antes da navegação), todas as seções são medidas de uma
 * vez; dois quadros depois voltam a ser puladas, já com o tamanho real guardado.
 * O mesmo vale ao chegar com #âncora ("Voltar ao site" da /assinante → /#planos, ou o link aberto numa aba nova).
 */
export function InPageLinks() {
  useLayoutEffect(() => {
    const first = firstMount;
    firstMount = false;
    const target = location.hash.length > 1 ? document.getElementById(location.hash.slice(1)) : null; // ids da página são ASCII
    if (!target) return;
    // Navegação do Next: ele rola até a âncora num efeito de layout do roteador, que roda depois deste
    // (efeitos de layout vão dos filhos para os pais), então a medição fica pronta antes da rolagem.
    const cancel = measureAll();
    // Carregamento direto: o navegador já rola (suave) até um destino calculado com as alturas estimadas.
    // Refaz de uma vez com as medidas reais; recarregar e voltar/avançar mantêm a posição do navegador.
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (!first || nav?.type !== "navigate") return cancel;
    const jump = () => target.scrollIntoView({ behavior: "instant" });
    jump();
    // a rolagem suave em curso ainda soma o passo de um quadro depois do salto: confere no quadro seguinte
    const raf = requestAnimationFrame(jump);
    return () => {
      cancelAnimationFrame(raf);
      cancel();
    };
  }, []);

  useEffect(() => {
    let cancel = () => {};
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href*='#']") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname !== location.pathname || url.hash.length < 2) return;
      cancel();
      cancel = measureAll();
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      cancel();
    };
  }, []);
  return null;
}

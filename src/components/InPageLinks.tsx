"use client";

import { useEffect } from "react";

/**
 * As seções abaixo da dobra usam content-visibility: auto (globals.css → .section): enquanto estão longe
 * da tela, a altura delas é uma estimativa. Um link interno (#planos, #niveis…) com rolagem suave
 * calcularia o destino com essas estimativas e pararia fora do lugar quando as seções do caminho
 * ganhassem a altura real. Por isso, no clique (antes da navegação), todas as seções são medidas de uma
 * vez; dois quadros depois voltam a ser puladas, já com o tamanho real guardado.
 */
export function InPageLinks() {
  useEffect(() => {
    const root = document.documentElement;
    let raf = 0;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href*='#']") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname !== location.pathname || url.hash.length < 2) return;
      root.dataset.cv = "all";
      void root.scrollHeight; // layout completo agora, antes de o navegador calcular o destino
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(() => delete root.dataset.cv);
      });
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      cancelAnimationFrame(raf);
      delete root.dataset.cv;
    };
  }, []);
  return null;
}

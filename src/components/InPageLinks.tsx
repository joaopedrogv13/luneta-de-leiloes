"use client";

import { useLayoutEffect } from "react";

/**
 * As seções abaixo da dobra usam content-visibility: auto (globals.css → .section): enquanto estão longe
 * da tela, a altura delas é uma estimativa. Um link interno (#planos, #niveis…) com rolagem suave
 * calcularia o destino com essas estimativas e pararia fora do lugar quando as seções do caminho
 * ganhassem a altura real. Por isso, no clique (antes da navegação), todas as seções são medidas de uma
 * vez; dois quadros depois voltam a ser puladas, já com o tamanho real guardado.
 *
 * Chegada à home já com a âncora, vindo de outra página ("Ver planos" do 404, /#advogado da área do
 * assinante): a medição é feita ao montar. O Next rola até a âncora logo depois deste efeito (o dele fica
 * num componente pai, e efeitos de layout rodam de dentro para fora), então ele já calcula com as alturas reais.
 * No carregamento completo com #âncora (link externo, recarregar), o script do <head> (layout.tsx) já
 * mede tudo desde a primeira pintura, para a rolagem do próprio navegador; aqui só é desfeito.
 */
export function InPageLinks() {
  // de layout: roda antes da pintura e antes da rolagem do Next
  useLayoutEffect(() => {
    const root = document.documentElement;
    let raf = 0;
    const measureAll = () => {
      root.dataset.cv = "all";
      void root.scrollHeight; // layout completo agora, antes de o navegador calcular o destino
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(() => delete root.dataset.cv);
      });
    };

    // chegada com âncora desta página, ou data-cv deixado pelo script do <head>
    const hash = location.hash.slice(1);
    if ((hash && document.getElementById(hash)) || root.dataset.cv) measureAll();

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href*='#']") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname !== location.pathname || url.hash.length < 2) return;
      measureAll();
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

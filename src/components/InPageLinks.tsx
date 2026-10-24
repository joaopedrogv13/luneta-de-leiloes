"use client";

import { useLayoutEffect } from "react";

/**
 * As seções abaixo da dobra usam content-visibility: auto (globals.css → .section): enquanto estão longe
 * da tela, a altura delas é uma estimativa. Um link interno (#planos, #niveis…) com rolagem suave
 * calcularia o destino com essas estimativas e pararia fora do lugar quando as seções do caminho
 * ganhassem a altura real. Por isso, no clique (antes da navegação), todas as seções são medidas de uma
 * vez; dois quadros depois voltam a ser puladas, já com o tamanho real guardado.
 *
 * Chegada à home já com a âncora, vindo de outra página ("Ver planos" do 404, /#especialista da área do
 * assinante): a medição é feita ao montar. O Next rola até a âncora logo depois deste efeito (o dele fica
 * num componente pai, e efeitos de layout rodam de dentro para fora), então ele já calcula com as alturas reais.
 * No carregamento completo com #âncora, ao recarregar e ao voltar/avançar, o script do <head> (layout.tsx)
 * já mede tudo desde a primeira pintura, para a posição do próprio navegador; aqui só é desfeito.
 *
 * Histórico: o link #âncora nativo cria uma entrada com history.state nulo, que o roteador do Next ignora
 * no Voltar (a tela da /assinante ficava na tela com a URL /#planos). No hashchange, a entrada nova recebe
 * o state que o Next tinha posto na anterior (marca __NA), e o Voltar volta a restaurar a home.
 */
export function InPageLinks() {
  // de layout: roda antes da pintura e antes da rolagem do Next
  useLayoutEffect(() => {
    const root = document.documentElement;
    let raf = 0;
    /** keepView: no clique, o que está no meio da tela não pode trocar de lugar quando as seções acima ganham a altura real. */
    const measureAll = (keepView = false) => {
      const ref = keepView ? document.elementFromPoint(innerWidth / 2, innerHeight / 2) : null;
      const before = ref?.getBoundingClientRect().top ?? 0;
      root.dataset.cv = "all";
      void root.scrollHeight; // layout completo agora, antes de o navegador calcular o destino
      if (ref) {
        const d = ref.getBoundingClientRect().top - before; // o que a ancoragem de rolagem do navegador não compensou
        if (Math.abs(d) > 1) window.scrollBy({ top: d, behavior: "instant" });
      }
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
      measureAll(true);
      const prev = history.state as { __NA?: unknown } | null;
      window.removeEventListener("hashchange", keepState);
      keepState = () => {
        window.removeEventListener("hashchange", keepState);
        if (history.state == null && prev?.__NA) history.replaceState(prev, "", location.href);
      };
      window.addEventListener("hashchange", keepState);
    };
    let keepState = () => {};
    const onPop = () => measureAll(); // voltar/avançar entre âncoras da home
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("hashchange", keepState);
      cancelAnimationFrame(raf);
      delete root.dataset.cv;
    };
  }, []);
  return null;
}

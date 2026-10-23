"use client";

import { useLayoutEffect } from "react";
import { alvoDaVolta, apagarSaida, ehDestinoDaApresentacao, gravarSaida, lerSaida, SELETOR_LINKS } from "@/lib/apresentacao";

/** Teclas e gestos que mostram que a pessoa já está rolando por conta própria (aí a volta não briga com ela). */
const GESTOS = ["wheel", "touchstart", "keydown", "pointerdown"] as const;

/**
 * Landing: a ida e a volta da demonstração (rodada 5, ponto 10; regras em src/lib/apresentacao.ts).
 *
 * Ida: o clique (sem tecla modificadora, na mesma aba) num link para /assinante… ou /metodologia… guarda, só nesta aba,
 * a rolagem, qual link foi clicado e onde ele estava na tela, e a seção de origem. Fica na fase de captura, antes do
 * <Link> do Next navegar.
 *
 * Volta (o botão "Voltar à apresentação" marcou `voltando`): antes da pintura, mede todas as seções (como o
 * InPageLinks: as de fora da tela usam content-visibility e a altura delas seria uma estimativa) e devolve o link
 * clicado ao mesmo lugar da tela; se ele era do menu fixo, ou sumiu, vale a rolagem guardada. Confere de novo nos
 * quadros seguintes (fontes, imagens), até a pessoa rolar por conta própria. O registro é apagado ao montar: entrar
 * depois na demonstração por outro caminho (digitando o endereço) não mostra o botão.
 *
 * Fica depois do <InPageLinks /> em page.tsx: os efeitos de layout de irmãos rodam na ordem, então a medição dele
 * (chegada com #âncora) vem antes e esta rolagem é a última.
 */
export function SaidaDaApresentacao() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const saida = lerSaida();
    apagarSaida();
    let raf = 0;
    let timer = 0;
    let parar = () => {};

    if (saida?.voltando) {
      let mexeu = false;
      const aoMexer = () => {
        mexeu = true;
      };
      const posicionar = () => {
        if (mexeu) return;
        const links = Array.from(document.querySelectorAll<HTMLAnchorElement>(SELETOR_LINKS));
        const a = links[saida.link];
        const mesmo = a && a.getAttribute("href") === saida.destino && a.getClientRects().length > 0;
        const topo = mesmo ? a.getBoundingClientRect().top + window.scrollY : null;
        const y = alvoDaVolta(saida, topo, root.scrollHeight - window.innerHeight);
        if (Math.abs(window.scrollY - y) > 1) window.scrollTo({ top: y, behavior: "instant" });
      };
      root.dataset.cv = "all";
      const antes = root.style.scrollBehavior;
      root.style.scrollBehavior = "auto";
      void root.scrollHeight; // layout completo agora
      posicionar();
      // a hidratação, as fontes e o content-visibility ainda podem mexer nas alturas: confere por ~1 s
      let quadros = 0;
      const conferir = () => {
        posicionar();
        if (++quadros === 2) delete root.dataset.cv;
        if (quadros < 60 && !mexeu) raf = requestAnimationFrame(conferir);
        else root.style.scrollBehavior = antes;
      };
      raf = requestAnimationFrame(conferir);
      timer = window.setTimeout(posicionar, 1200);
      for (const g of GESTOS) window.addEventListener(g, aoMexer, { passive: true, once: true });
      parar = () => {
        for (const g of GESTOS) window.removeEventListener(g, aoMexer);
        root.style.scrollBehavior = antes;
      };
    }

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self")) return;
      const href = a.getAttribute("href") ?? "";
      if (!ehDestinoDaApresentacao(href)) return;
      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>(SELETOR_LINKS));
      gravarSaida({
        v: 1,
        em: Date.now(),
        y: Math.round(window.scrollY),
        link: links.indexOf(a),
        destino: href,
        linkTopo: Math.round(a.getBoundingClientRect().top),
        fixo: !!a.closest("header, [data-fixo]"),
        secao: a.closest("section[id]")?.id ?? null,
        token: Math.random().toString(36).slice(2, 10),
      });
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      parar();
    };
  }, []);
  return null;
}

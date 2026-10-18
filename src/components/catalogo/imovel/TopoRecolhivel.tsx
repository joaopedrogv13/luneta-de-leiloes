"use client";

import { useEffect } from "react";

/** Marca no <html> enquanto o cabeçalho está fora de cena (o CSS esconde o cabeçalho e sobe a navegação das seções). */
const ATRIBUTO = "data-topo-recolhido";
/** Celular e tablet com altura normal (em tela baixa o cabeçalho já rola junto com a página). */
const CONSULTA = "(max-width: 63.99rem) and (min-height: 500.02px)";

/**
 * Celular e tablet: o cabeçalho da página do imóvel sai de cena ao rolar para baixo e volta ao rolar para cima,
 * como a barra de filtros do catálogo; enquanto ele está fora, a navegação das seções sobe para o topo. As barras
 * fixas passam de ~22% para ~15% da tela. Com o foco no cabeçalho (teclado), ele volta e fica. No computador, ele
 * fica fixo (o resumo da direita cola logo abaixo dele).
 */
export function TopoRecolhivel() {
  useEffect(() => {
    const html = document.documentElement;
    const mq = window.matchMedia(CONSULTA);
    const cabecalho = document.querySelector<HTMLElement>("[data-topo-imovel]");
    let ultimoY = window.scrollY;
    let quadro = 0;
    const definir = (recolher: boolean) => {
      if (recolher === html.hasAttribute(ATRIBUTO)) return;
      if (recolher) html.setAttribute(ATRIBUTO, "");
      else html.removeAttribute(ATRIBUTO);
    };
    const medir = () => {
      quadro = 0;
      const y = window.scrollY;
      if (!mq.matches) {
        ultimoY = y;
        definir(false);
        return;
      }
      const dy = y - ultimoY;
      if (Math.abs(dy) < 6) return;
      ultimoY = y;
      const foco = !!cabecalho && cabecalho.contains(document.activeElement);
      // perto do topo, sempre à vista; descendo, sai; subindo, volta
      definir(dy > 0 && y > (cabecalho?.offsetHeight ?? 56) + 80 && !foco);
    };
    const agendar = () => {
      if (!quadro) quadro = requestAnimationFrame(medir);
    };
    const aoFocar = (e: FocusEvent) => {
      if (cabecalho && e.target instanceof Node && cabecalho.contains(e.target)) definir(false);
    };
    window.addEventListener("scroll", agendar, { passive: true });
    window.addEventListener("resize", agendar);
    document.addEventListener("focusin", aoFocar);
    return () => {
      cancelAnimationFrame(quadro);
      window.removeEventListener("scroll", agendar);
      window.removeEventListener("resize", agendar);
      document.removeEventListener("focusin", aoFocar);
      definir(false);
    };
  }, []);
  return null;
}

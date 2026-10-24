"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useMidia } from "../app/hooks";
import { IconeLista, IconeMapa } from "../cartoes/icones";

/** Quanto da folha aparece embaixo com o mapa aberto (o título e o começo do primeiro cartão). */
export const ESPIADA = 132;
/**
 * Com pouco espaço para o mapa (celular deitado: ~210 px entre a barra e o pé da tela), a folha espia só o título: com
 * 132 px ela cobria mais da metade do mapa, e os botões e os créditos ficavam embaixo dela.
 */
export const ESPIADA_BAIXA = 78;
/**
 * Tela baixa (celular deitado; a barra de filtros ocupa ~180 px): a espiada baixa. Por consulta de mídia, e não pela
 * altura medida, para a folha já nascer na altura certa (medida depois, ela pulava: CLS de 0,02 a 0,03). A altura da
 * folga (CSS) e a do mapa (JS) seguem a mesma consulta.
 */
const CONSULTA_TELA_BAIXA = "(max-height: 600px)";

type Posicao = "espiada" | "meio" | "cheia";

/**
 * Celular e tablet na vista de mapa: o mapa ocupa a tela abaixo da barra de filtros, e a lista fica numa folha por
 * cima dele, que se puxa com o dedo (rolagem nativa com encaixe em três alturas: espiada, meio e cheia). A rolagem é a
 * do próprio navegador (inércia, acessibilidade, teclado): a área transparente acima da folha deixa os toques
 * passarem para o mapa (pinça, arrasto). A página atrás não rola.
 */
export function FolhaMapa({
  mapa,
  titulo,
  barra,
  children,
}: {
  /** o mapa, com a altura da espiada (a folga de baixo dele: créditos, escala e enquadramento acima da folha) */
  mapa: (espiada: number) => ReactNode;
  titulo: ReactNode;
  /** a barra de filtros: o mapa começa logo abaixo dela (onde ela estiver na tela) */
  barra: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const rolo = useRef<HTMLDivElement>(null);
  const meio = useRef<HTMLDivElement>(null);
  const [posicao, setPosicao] = useState<Posicao>("espiada");
  const [topo, setTopo] = useState<number | null>(null);
  const espiada = useMidia(CONSULTA_TELA_BAIXA, false) ? ESPIADA_BAIXA : ESPIADA;

  // o mapa começa onde a barra termina (com o cabeçalho à vista no topo da página, ou a barra colada no alto). A primeira
  // medida sai antes da pintura (efeito de layout): medida num quadro depois, a folha nascia no topo padrão e descia
  // ~120 px (CLS de até 0,1 no tablet)
  useLayoutEffect(() => {
    const el = barra.current;
    if (!el) return;
    let quadro = 0;
    const medir = () => {
      quadro = 0;
      setTopo(Math.max(0, Math.round(el.getBoundingClientRect().bottom)));
    };
    const pedir = () => {
      if (!quadro) quadro = requestAnimationFrame(medir);
    };
    medir();
    const ro = new ResizeObserver(pedir);
    ro.observe(el);
    window.addEventListener("resize", pedir);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", pedir);
      cancelAnimationFrame(quadro);
    };
  }, [barra]);

  // a página atrás do mapa não rola (o gesto vai para o mapa ou para a folha)
  useEffect(() => {
    const html = document.documentElement;
    const antes = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = antes;
    };
  }, []);

  // em que altura a folha está (para o botão "Ver mapa" e o rótulo do puxador); só muda o estado quando muda de faixa
  useEffect(() => {
    const el = rolo.current;
    const m = meio.current;
    if (!el || !m) return;
    let quadro = 0;
    const medir = () => {
      quadro = 0;
      const y = el.scrollTop;
      const fim = el.scrollHeight - el.clientHeight;
      const limiteCheia = m.offsetTop + m.offsetHeight - 24;
      setPosicao(y < m.offsetTop / 2 ? "espiada" : y < Math.min(fim, limiteCheia) ? "meio" : "cheia");
    };
    const aoRolar = () => {
      if (!quadro) quadro = requestAnimationFrame(medir);
    };
    el.addEventListener("scroll", aoRolar, { passive: true });
    return () => {
      el.removeEventListener("scroll", aoRolar);
      cancelAnimationFrame(quadro);
    };
  }, []);

  const irPara = (p: Posicao) => {
    const el = rolo.current;
    const m = meio.current;
    if (!el || !m) return;
    const alvo = p === "espiada" ? 0 : p === "meio" ? m.offsetTop : m.offsetTop + m.offsetHeight;
    el.scrollTo({ top: alvo, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-[25] top-[var(--topo-h)]" style={topo !== null ? { top: topo } : undefined}>
      <div className="absolute inset-0">{mapa(espiada)}</div>
      <div
        ref={rolo}
        className="pointer-events-none absolute inset-0 snap-y snap-mandatory overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {/* duas alturas de encaixe acima da folha: espiada (topo) e meio */}
        <div aria-hidden="true" className="h-[45%] snap-start" />
        {/* a espiada (ESPIADA, ESPIADA_BAIXA) em CSS, pela mesma consulta de CONSULTA_TELA_BAIXA */}
        <div ref={meio} aria-hidden="true" className="h-[calc(55%-132px)] snap-start [@media(max-height:600px)]:h-[calc(55%-78px)]" />
        <section
          aria-label="Imóveis da área do mapa"
          className="pointer-events-auto relative min-h-full snap-start rounded-t-[28px] border-t border-nevoa/15 bg-noite shadow-[0_-16px_44px_rgba(0,0,0,.42)] [[data-theme=light]_&]:shadow-[0_-12px_36px_rgba(15,24,48,.16)]"
        >
          <button
            type="button"
            onClick={() => irPara(posicao === "espiada" ? "cheia" : "espiada")}
            aria-expanded={posicao !== "espiada"}
            className="sticky top-0 z-10 flex w-full cursor-pointer flex-col items-center gap-2 rounded-t-[28px] bg-noite px-4 pt-2.5 pb-3"
          >
            <span aria-hidden="true" className="h-1.5 w-10 rounded-full bg-nevoa/40" />
            <span className="flex w-full items-center justify-between gap-3 text-left">
              <span className="min-w-0 flex-1">{titulo}</span>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-nevoa/25 px-3 py-1.5 text-[13px] font-semibold text-luar">
                {posicao === "espiada" ? <IconeLista /> : <IconeMapa />}
                {posicao === "espiada" ? "Ver lista" : "Ver mapa"}
              </span>
            </span>
          </button>
          <div className="px-4 pb-24">{children}</div>
        </section>
      </div>
      {posicao === "cheia" && (
        <button
          type="button"
          onClick={() => irPara("espiada")}
          className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-[26] inline-flex min-h-12 -translate-x-1/2 cursor-pointer items-center gap-2 rounded-full bg-luar px-5 text-[15px] font-semibold text-noite shadow-[0_14px_36px_rgba(0,0,0,.45)] active:scale-[0.96] motion-reduce:transition-none"
        >
          <IconeMapa />
          Ver mapa
        </button>
      )}
    </div>
  );
}

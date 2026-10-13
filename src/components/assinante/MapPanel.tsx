"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Listing } from "@/content/examples";
import { BrazilMap } from "@/components/ui/BrazilMap";
import { desagioView, type Plan } from "./shared";

/** Distância mínima entre centros de pinos, em px: as áreas de toque (círculos de 24px) não se encostam. */
const MIN_GAP = 26;

/**
 * Afasta de leve os pinos muito próximos (ex.: SP, Curitiba, RJ e BH num mapa estreito ou numa janela baixa),
 * para cada um continuar com 24px de alvo só seu (WCAG 2.5.8). Trabalha em px, no tamanho real do mapa,
 * e devolve as posições no viewBox 400×400. Com espaço sobrando, nada se move.
 */
function spreadPins(points: (readonly [number, number])[], mapPx: number): [number, number][] {
  if (mapPx <= 0) return points.map(([x, y]) => [x, y]);
  const k = mapPx / 400;
  const p = points.map(([x, y]) => [x * k, y * k]);
  for (let round = 0; round < 30; round++) {
    let moved = false;
    for (let i = 0; i < p.length; i++) {
      for (let j = i + 1; j < p.length; j++) {
        let dx = p[j][0] - p[i][0];
        let dy = p[j][1] - p[i][1];
        let d = Math.hypot(dx, dy);
        if (d >= MIN_GAP) continue;
        // mesmo ponto (dois imóveis na mesma rua): separa na horizontal
        if (d < 0.01) [dx, dy, d] = [1, 0, 1];
        const push = (MIN_GAP - d) / 2 + 0.05;
        p[i][0] -= (dx / d) * push;
        p[i][1] -= (dy / d) * push;
        p[j][0] += (dx / d) * push;
        p[j][1] += (dy / d) * push;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return p.map(([x, y]) => [x / k, y / k]);
}

/**
 * Mapa à direita (desktop ≥ 1024px), sticky. Um pin por exemplo da lista filtrada, pulsando a 2s:
 * Alvo em verde, os demais em latão (no plano Lente todos em latão, para não entregar o selo).
 * Passar o mouse num cartão acende o pin (scale 1.6, luar) e vice-versa; clicar no pin abre o detalhe.
 * O pin é um botão de 16px com área de toque circular de 24px (::before); o ponto e o anel pulsante
 * são só desenho (pointer-events-none), para não roubar o clique nem cobrir o pin vizinho.
 * O painel é escuro nos dois temas, como o mapa da landing.
 */
export function MapPanel({
  results,
  plan,
  activeId,
  onHover,
  onOpen,
  noun = ["exemplo", "exemplos"],
}: {
  results: Listing[];
  plan: Plan;
  activeId: string | null;
  onHover: (id: string | null) => void;
  onOpen: (id: string, opener: HTMLElement) => void;
  /** singular e plural do que a lista mostra ("exemplo", "imóvel"…) */
  noun?: readonly [string, string];
}) {
  const box = useRef<HTMLDivElement>(null);
  const [mapPx, setMapPx] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setMapPx(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const spots = useMemo(() => spreadPins(results.map((l) => l.point), mapPx), [results, mapPx]);

  const focus = results.find((l) => l.id === activeId);
  const n = results.length;
  const caption = focus
    ? `${focus.title} · ${focus.place} · ${desagioView(focus).short}`
    : `${n} ${n === 1 ? "leilão" : "leilões"} no mapa · passe o mouse sobre um cartão`;

  return (
    <aside
      aria-label={`Mapa dos ${noun[1]}`}
      className="sticky top-16 hidden h-[calc(100svh-4rem)] self-start overflow-hidden border-l border-nevoa/15 bg-[radial-gradient(circle_at_50%_45%,#16224A,#0F1830_70%)] lg:block"
    >
      <div aria-hidden="true" className="grid-lines absolute inset-0" />
      {/* lg–2xl: coluna de 400px; com px-4 o mapa ganha 32px (336 → 368px) e os pinos do Sudeste respiram */}
      <div className="absolute inset-x-0 top-0 bottom-20 flex items-center justify-center px-4 2xl:px-8">
        <div ref={box} className="relative aspect-square w-[min(100%,calc(100svh-12rem))]">
          <BrazilMap pins={[]} label={`Mapa do Brasil com ${n} ${n === 1 ? noun[0] : noun[1]} da lista`} />
          {results.map((l, i) => {
            const [x, y] = spots[i];
            const lit = l.id === activeId;
            const alvo = plan === "luneta" && l.seal === 3;
            return (
              <button
                key={l.id}
                type="button"
                aria-haspopup="dialog"
                aria-label={`Abrir detalhe: ${l.title}, ${l.place}`}
                onClick={(e) => onOpen(l.id, e.currentTarget)}
                onMouseEnter={() => onHover(l.id)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(l.id)}
                onBlur={() => onHover(null)}
                className={`absolute grid size-4 -translate-x-1/2 -translate-y-1/2 cursor-pointer place-items-center rounded-full before:absolute before:-inset-1 before:rounded-full before:content-[''] focus-visible:outline-[#EAF0FF] ${lit ? "z-10" : ""}`}
                style={{ left: `${(x / 400) * 100}%`, top: `${(y / 400) * 100}%` }}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none relative block size-3 rounded-full transition-[scale,background-color,box-shadow] duration-200 ease-out ${
                    lit
                      ? "scale-160 bg-[#EAF0FF] shadow-[0_0_14px_#EAF0FF]"
                      : alvo
                        ? "scale-120 bg-[#4ADE9A] shadow-[0_0_10px_#4ADE9A]"
                        : "bg-latao shadow-[0_0_10px_#C9A24D]"
                  }`}
                >
                  <span className="absolute top-1/2 left-1/2 size-4 animate-pulse-ring rounded-full border-[1.5px] border-latao motion-reduce:hidden" />
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <p className="absolute inset-x-4 bottom-4 rounded-xl border border-latao/40 bg-noite-fixa/85 px-3.5 py-3 text-xs leading-snug font-medium text-[#EAF0FF]">
        {caption}
      </p>
    </aside>
  );
}

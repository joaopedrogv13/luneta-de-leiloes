"use client";

import type { Listing } from "@/content/examples";
import { BrazilMap } from "@/components/ui/BrazilMap";
import type { Plan } from "./shared";

/**
 * Mapa à direita (desktop ≥ 1024px), sticky. Um pin por exemplo da lista filtrada, pulsando a 2s:
 * Alvo em verde, os demais em latão (no plano Lente todos em latão, para não entregar o selo).
 * Passar o mouse num cartão acende o pin (scale 1.6, luar) e vice-versa; clicar no pin abre o detalhe.
 * O painel é escuro nos dois temas, como o mapa da landing.
 */
export function MapPanel({
  results,
  plan,
  activeId,
  onHover,
  onOpen,
}: {
  results: Listing[];
  plan: Plan;
  activeId: string | null;
  onHover: (id: string | null) => void;
  onOpen: (id: string, opener: HTMLElement) => void;
}) {
  const focus = results.find((l) => l.id === activeId);
  const n = results.length;
  const caption = focus
    ? `${focus.title} · ${focus.place} · −${focus.desagio}%`
    : `${n} ${n === 1 ? "leilão" : "leilões"} no mapa · passe o mouse sobre um cartão`;

  return (
    <aside
      aria-label="Mapa dos exemplos"
      className="sticky top-16 hidden h-[calc(100svh-4rem)] self-start overflow-hidden border-l border-nevoa/15 bg-[radial-gradient(circle_at_50%_45%,#16224A,#0F1830_70%)] lg:block"
    >
      <div aria-hidden="true" className="grid-lines absolute inset-0" />
      <div className="absolute inset-x-0 top-0 bottom-20 flex items-center justify-center px-8">
        <div className="relative aspect-square w-[min(100%,calc(100svh-12rem))]">
          <BrazilMap pins={[]} label={`Mapa do Brasil com ${n} ${n === 1 ? "exemplo" : "exemplos"} da lista`} />
          {results.map((l) => {
            const [x, y] = l.point;
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
                className={`absolute grid size-6 -translate-x-1/2 -translate-y-1/2 cursor-pointer place-items-center rounded-full focus-visible:outline-[#EAF0FF] ${lit ? "z-10" : ""}`}
                style={{ left: `${(x / 400) * 100}%`, top: `${(y / 400) * 100}%` }}
              >
                <span
                  aria-hidden="true"
                  className={`relative block size-3 rounded-full transition-[scale,background-color,box-shadow] duration-200 ease-out ${
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

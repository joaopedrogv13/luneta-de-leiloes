"use client";

import { useMemo, useState } from "react";
import { LISTINGS, brl, type Listing } from "@/content/examples";
import { FILTERS } from "@/content/site";
import { BrazilMap } from "@/components/ui/BrazilMap";
import { SEAL_NAMES } from "@/components/ui/Seal";

type FilterKey = "sp" | "apto" | "des30" | "praca2" | "desoc";

/** `luneta`: filtro avançado (praça e ocupação), do plano Luneta (src/lib/catalogo/planos.ts, FILTROS_LENTE). */
const DEMO_FILTERS: { key: FilterKey; label: string; luneta?: boolean; test: (l: Listing) => boolean }[] = [
  { key: "sp", label: "Estado: SP", test: (l) => l.uf === "SP" },
  { key: "apto", label: "Tipo: apartamento", test: (l) => l.type === "apartamento" },
  { key: "des30", label: "Deságio ≥ 30%", test: (l) => l.desagio >= 30 },
  { key: "praca2", label: "2ª praça", luneta: true, test: (l) => l.praca === "2ª praça" },
  { key: "desoc", label: "Desocupado", luneta: true, test: (l) => l.desocupado },
];

/**
 * Demonstração dos filtros e do mapa sobre os exemplos fictícios: toque num filtro e a lista e os
 * pins atualizam na hora. Passar o mouse num item acende o pin correspondente.
 */
export function FilterDemo() {
  const [on, setOn] = useState<Record<FilterKey, boolean>>({ sp: false, apto: false, des30: true, praca2: false, desoc: false });
  const [hover, setHover] = useState<string | null>(null);

  const results = useMemo(
    () => LISTINGS.filter((l) => DEMO_FILTERS.every((f) => !on[f.key] || f.test(l))).sort((a, b) => b.desagio - a.desagio),
    [on],
  );
  const ids = new Set(results.map((r) => r.id));

  return (
    <div className="mt-10 grid grid-cols-1 overflow-hidden rounded-3xl border border-nevoa/15 bg-tinta sm:mt-16 md:grid-cols-2">
      <div className="flex flex-col gap-6 p-5 sm:p-9">
        <fieldset>
          <legend className="text-[11px] font-semibold tracking-[0.14em] text-nevoa uppercase">Filtros</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {DEMO_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={on[f.key]}
                onClick={() => setOn((s) => ({ ...s, [f.key]: !s[f.key] }))}
                className={`min-h-11 rounded-full border px-4 text-[13px] font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.96] ${
                  on[f.key] ? "border-latao bg-latao/15 text-luar" : "border-nevoa/40 text-nevoa hover:border-nevoa/70 hover:text-luar"
                }`}
              >
                {on[f.key] && (
                  <span aria-hidden="true" className="mr-1.5">
                    ✓
                  </span>
                )}
                {f.label}
                {f.luneta && (
                  <span className="ml-2 rounded-full border border-latao/50 px-1.5 py-0.5 text-[10px] leading-none font-semibold tracking-[0.08em] text-latao-texto uppercase">
                    <span className="sr-only">(plano </span>
                    {FILTERS.luneta}
                    <span className="sr-only">)</span>
                  </span>
                )}
              </button>
            ))}
          </div>
        </fieldset>

        <p aria-live="polite" className="flex items-baseline gap-2.5">
          <span className="font-display text-[clamp(40px,4vw,56px)] leading-none font-bold tracking-[-0.04em]">{results.length}</span>
          <span className="text-sm text-nevoa">de {LISTINGS.length} exemplos fictícios encontrados</span>
        </p>

        <ul className="flex flex-col">
          {results.map((l) => (
            <li
              key={l.id}
              onMouseEnter={() => setHover(l.id)}
              onMouseLeave={() => setHover(null)}
              className={`flex items-center justify-between gap-3 border-t border-nevoa/15 py-3 text-[13px] transition-colors ${
                hover === l.id ? "text-luar" : "text-nevoa"
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold text-luar">{l.title}</span>
                <span className="block truncate">
                  {l.place} · {l.praca} · lance {brl(l.lance)}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-display text-lg leading-none font-bold text-luar">−{l.desagio}%</span>
                <span className="text-[11px]">{SEAL_NAMES[l.seal]}</span>
              </span>
            </li>
          ))}
          {results.length === 0 && (
            <li className="border-t border-nevoa/15 py-4 text-sm text-nevoa">Nenhum exemplo com esses filtros. Tire um filtro para abrir o foco.</li>
          )}
        </ul>
      </div>

      <div className="relative min-h-[340px] border-nevoa/15 bg-[radial-gradient(circle_at_50%_50%,#16224A,#0F1830_70%)] max-md:border-t md:min-h-[440px] md:border-l">
        <div aria-hidden="true" className="grid-lines absolute inset-0" />
        <div className="absolute inset-[8%]">
          <BrazilMap pins={[]} label={`Mapa do Brasil com ${results.length} exemplos destacados`} />
          {LISTINGS.map((l) => {
            const [x, y] = l.point;
            const active = ids.has(l.id);
            const lit = hover === l.id;
            return (
              <span
                key={l.id}
                aria-hidden="true"
                className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-[transform,opacity,background-color] duration-300 ${
                  lit ? "size-3 scale-150 bg-[#EAF0FF] shadow-[0_0_14px_#EAF0FF]" : "size-2.5 bg-latao"
                } ${active ? "opacity-100" : "scale-75 opacity-25"}`}
                style={{ left: `${(x / 400) * 100}%`, top: `${(y / 400) * 100}%` }}
              >
                {active && (
                  <span className="absolute top-1/2 left-1/2 size-3.5 animate-pulse-ring rounded-full border-[1.5px] border-latao motion-reduce:hidden" />
                )}
              </span>
            );
          })}
        </div>
        {results[0] && (
          <p className="absolute bottom-4 left-4 rounded-xl border border-latao/40 bg-noite-fixa/85 px-3.5 py-2.5 text-xs text-[#EAF0FF] backdrop-blur-sm">
            <span aria-hidden="true" className="font-bold text-[#4ADE9A]">
              ●
            </span>{" "}
            Maior deságio: {results[0].place.split(" · ")[0]} · −{results[0].desagio}% · {SEAL_NAMES[results[0].seal]}
          </p>
        )}
      </div>
    </div>
  );
}

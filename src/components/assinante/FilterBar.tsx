"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { LockIcon, RingsIcon } from "./parts";
import { OPEN_FILTERS, UF_NOMES, prefersReducedMotion, type FilterKey, type Filters, type Plan } from "./shared";

/** A contagem "conta" até o novo valor em 300ms (instantânea com "reduzir movimento"). */
function useCountTo(value: number, ms = 300) {
  const [shown, setShown] = useState(value);
  const current = useRef(value);
  useEffect(() => {
    const from = current.current;
    if (from === value) return;
    const t0 = performance.now();
    const instant = prefersReducedMotion();
    let raf = 0;
    const tick = (t: number) => {
      const p = instant ? 1 : Math.min(1, (t - t0) / ms);
      const v = Math.round(from + (value - from) * (1 - Math.pow(1 - p, 3)));
      current.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

const chipBase =
  "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-[13px] leading-none font-medium whitespace-nowrap transition-[background-color,border-color,color,scale] duration-[120ms] active:scale-[0.96] pointer-fine:min-h-9 pointer-fine:px-3.5";
const chipOn = "border-latao bg-latao/15 text-luar";
const chipOff = "border-nevoa/35 text-nevoa hover:border-nevoa/70 hover:text-luar";

/**
 * Barra de filtros: seletor de estado (as UFs da lista, com quantos itens cada uma tem), chips com
 * aria-pressed e o "pressionar" de 120ms. "Só com selo" fica travado no plano Lente (cadeado balança e
 * abre o upgrade). A contagem é anunciada a leitores de tela.
 */
export function FilterBar({
  plan,
  filters,
  count,
  onToggle,
  onLocked,
  uf,
  ufs,
  onUf,
  noun = ["exemplo", "exemplos"],
}: {
  plan: Plan;
  filters: Filters;
  count: number;
  onToggle: (k: FilterKey) => void;
  onLocked: (opener: HTMLElement) => void;
  /** UF escolhida ("" = todos os estados) */
  uf: string;
  /** UFs da lista, com o total de cada uma */
  ufs: readonly { uf: string; total: number }[];
  onUf: (uf: string) => void;
  /** singular e plural da contagem ("exemplo", "imóvel"…) */
  noun?: readonly [string, string];
}) {
  const lente = plan === "lente";
  const lock = useRef<HTMLSpanElement>(null);
  const shown = useCountTo(count);
  const word = count === 1 ? noun[0] : noun[1];
  const summary = `${count} ${word} · ordenado por maior deságio`;

  const onSeal = (e: MouseEvent<HTMLButtonElement>) => {
    if (!lente) return onToggle("selo");
    if (lock.current && !prefersReducedMotion()) {
      lock.current.animate([{ rotate: "0deg" }, { rotate: "-8deg" }, { rotate: "8deg" }, { rotate: "-8deg" }, { rotate: "0deg" }], { duration: 360, easing: "ease-in-out" });
    }
    onLocked(e.currentTarget);
  };

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <div role="group" aria-labelledby="rotulo-filtros" className="flex flex-wrap items-center gap-2">
        <span id="rotulo-filtros" className="mr-1 text-[10px] leading-none font-semibold tracking-[0.14em] text-nevoa uppercase">
          Filtros
        </span>
        <span className="relative inline-flex">
          <select
            aria-label="Estado"
            value={uf}
            onChange={(e) => onUf(e.target.value)}
            className={`${chipBase} appearance-none pr-8 pointer-fine:pr-7 ${uf ? chipOn : chipOff} [&>option]:bg-tinta [&>option]:text-luar`}
          >
            <option value="">Estado: todos</option>
            {ufs.map((o) => (
              <option key={o.uf} value={o.uf}>
                {`${o.uf} · ${UF_NOMES[o.uf] ?? o.uf} (${o.total})`}
              </option>
            ))}
          </select>
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            aria-hidden="true"
            className={`pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 pointer-fine:right-3 ${uf ? "text-luar" : "text-nevoa"}`}
          >
            <path d="M1.5 3.5L5 7l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        {OPEN_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filters[f.key]}
            onClick={() => onToggle(f.key)}
            className={`${chipBase} ${filters[f.key] ? chipOn : chipOff}`}
          >
            {f.label}
          </button>
        ))}
        <span aria-hidden="true" className="mx-1 hidden h-[22px] w-px bg-nevoa/25 sm:block" />
        <button
          type="button"
          aria-pressed={lente ? undefined : filters.selo}
          aria-haspopup={lente ? "dialog" : undefined}
          onClick={onSeal}
          className={`${chipBase} ${!lente && filters.selo ? chipOn : chipOff}`}
        >
          <span ref={lock} className="inline-flex">
            {lente ? <LockIcon /> : <RingsIcon />}
          </span>
          Só com selo
          {lente && (
            <span className="text-[10px] font-semibold tracking-[0.08em] text-latao-texto">
              LUNETA<span className="sr-only"> (recurso do plano Luneta)</span>
            </span>
          )}
        </button>
      </div>
      <div className="hidden flex-1 md:block" />
      <p className="w-full text-[13px] leading-none text-nevoa md:w-auto">
        <span aria-hidden="true">
          <strong className="font-display text-base font-bold text-luar tabular-nums">{shown}</strong>{" "}
          {word} · ordenado por maior deságio
        </span>
        <span className="sr-only" aria-live="polite">
          {summary}
        </span>
      </p>
    </div>
  );
}

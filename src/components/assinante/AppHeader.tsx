"use client";

import Link from "next/link";
import type { RefObject } from "react";
import { LogoMark } from "@/components/ui/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { RingsIcon } from "./parts";
import type { Plan } from "./shared";

const PLANS: { id: Plan; label: string }[] = [
  { id: "lente", label: "Lente" },
  { id: "luneta", label: "Luneta" },
];

/**
 * Cabeçalho do app (sticky): logo, busca, "Ver como: Lente | Luneta", selo do plano e tema.
 * No celular vira duas linhas (logo + troca de plano + tema; busca + selo do plano).
 */
export function AppHeader({
  plan,
  onPlan,
  query,
  onQuery,
  lunetaBtnRef,
}: {
  plan: Plan;
  onPlan: (p: Plan) => void;
  query: string;
  onQuery: (q: string) => void;
  /** recebe o foco depois de "Assinar Luneta" no banner (que some ao trocar de plano) */
  lunetaBtnRef: RefObject<HTMLButtonElement | null>;
}) {
  const lente = plan === "lente";
  return (
    <header className="sticky top-0 z-30 border-b border-nevoa/15 bg-noite/90 backdrop-blur-md">
      <div className="mx-auto flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 sm:px-6 md:h-16 md:flex-nowrap md:py-0 lg:px-8">
        <Link
          href="/"
          aria-label="Luneta de Leilões, voltar ao site"
          className="mr-auto inline-flex min-h-11 items-center gap-2.5 rounded-md font-display text-base leading-none font-bold tracking-[-0.01em] whitespace-nowrap text-luar no-underline md:mr-0"
        >
          <LogoMark />
          Luneta
        </Link>

        <div role="search" className="relative order-4 min-w-[50%] flex-1 md:order-none md:max-w-[460px] md:min-w-0">
          <label htmlFor="busca" className="sr-only">
            Buscar por título, bairro, cidade ou UF
          </label>
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-nevoa"
          >
            <circle cx="7" cy="7" r="5" />
            <path d="M11 11l3.2 3.2" />
          </svg>
          <input
            id="busca"
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Cidade, bairro ou UF"
            autoComplete="off"
            enterKeyHint="search"
            className="h-11 w-full rounded-full border border-nevoa/25 bg-tinta pr-4 pl-10 text-base text-luar transition-colors placeholder:text-nevoa hover:border-nevoa/50 focus:border-latao sm:text-sm pointer-fine:h-10"
          />
        </div>

        <div className="hidden md:block md:flex-1" />

        <div role="group" aria-label="Ver como" className="order-2 inline-flex items-center rounded-full border border-nevoa/25 bg-tinta p-0.5 md:order-none">
          <span aria-hidden="true" className="hidden pr-2 pl-2.5 text-[10px] leading-none font-medium tracking-[0.12em] whitespace-nowrap text-nevoa uppercase md:inline">
            Ver como
          </span>
          {PLANS.map((p) => {
            const on = plan === p.id;
            return (
              <button
                key={p.id}
                ref={p.id === "luneta" ? lunetaBtnRef : undefined}
                type="button"
                aria-pressed={on}
                onClick={() => onPlan(p.id)}
                className={`min-h-11 cursor-pointer rounded-full px-3.5 text-xs font-semibold transition-[background-color,color,scale] duration-200 active:scale-[0.96] pointer-fine:min-h-9 ${
                  on ? "bg-latao text-noite-fixa" : "text-nevoa hover:text-luar"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <p
          className={`order-5 inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[11px] leading-none font-semibold tracking-[0.1em] whitespace-nowrap uppercase transition-colors duration-300 md:order-none ${
            lente ? "border-nevoa/40 text-nevoa" : "border-latao text-latao-texto"
          }`}
        >
          <RingsIcon rings={lente ? 1 : 2} size={12} />
          Plano {lente ? "Lente" : "Luneta"}
        </p>

        <div className="order-3 md:order-none">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

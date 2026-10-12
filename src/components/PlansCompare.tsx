"use client";

import { useId, useState, type ReactNode } from "react";

/**
 * Caixa rolável da tabela "Compare os planos". Abaixo de lg ela começa recolhida atrás do botão
 * "Comparar todos os recursos" (a tabela tem ~940px de altura e rola na horizontal no celular);
 * a partir de lg fica sempre aberta e o botão some, só com CSS: o HTML do servidor já sai assim,
 * sem salto quando a página hidrata. Sem JS (noscript), a tabela aparece aberta e o botão não.
 */
export function PlansCompare({ labelId, children }: { labelId: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="mt-12 flex w-full items-center justify-between gap-4 rounded-3xl border border-nevoa/20 px-5 py-4 text-left font-display text-lg leading-snug font-bold text-luar transition-colors hover:border-latao/55 lg:hidden noscript:hidden"
      >
        Comparar todos os recursos
        <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full border border-latao/60 text-latao-texto">
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform duration-300 ${open ? "rotate-180" : ""}`}
          >
            <path d="M3 5.5l4 4 4-4" />
          </svg>
        </span>
      </button>
      <div
        id={id}
        role="region"
        aria-labelledby={labelId}
        tabIndex={0}
        // relative: os textos sr-only (position: absolute) das células ficam presos à caixa rolável;
        // sem isso eles escapavam do recorte e alargavam a página no celular
        className={`relative mt-3 overflow-x-auto rounded-3xl border border-nevoa/20 lg:mt-12 noscript:mt-12 ${open ? "" : "max-lg:not-noscript:hidden"}`}
      >
        {children}
      </div>
    </>
  );
}

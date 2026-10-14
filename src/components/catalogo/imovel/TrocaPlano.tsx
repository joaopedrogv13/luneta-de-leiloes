"use client";

import Link from "next/link";
import { rotaImovel } from "@/lib/catalogo/rotas";
import type { Conjunto, Plano } from "@/lib/catalogo/tipos";
import { guardarAncora } from "./rolagem";

const PLANOS: { id: Plano; rotulo: string }[] = [
  { id: "lente", rotulo: "Lente" },
  { id: "luneta", rotulo: "Luneta" },
];

/**
 * "Ver como: Lente | Luneta": a mesma página no outro plano. Antes de trocar, guarda a seção à vista; depois,
 * a página volta a mostrá-la no mesmo lugar (a seção de riscos muda de altura entre os planos e, sem isso, a
 * pessoa caía em outra seção).
 */
export function TrocaPlano({ conjunto, plano, id }: { conjunto: Conjunto; plano: Plano; id: string }) {
  return (
    <div role="group" aria-label="Ver como" className="inline-flex items-center rounded-full border border-nevoa/25 bg-tinta p-0.5">
      <span aria-hidden="true" className="hidden pr-2 pl-2.5 text-[10px] leading-none font-medium tracking-[0.12em] whitespace-nowrap text-nevoa uppercase md:inline">
        Ver como
      </span>
      {PLANOS.map((p) => {
        const ativo = p.id === plano;
        return (
          <Link
            key={p.id}
            href={rotaImovel(conjunto, id, p.id)}
            replace
            scroll={false}
            prefetch={false}
            aria-current={ativo ? "page" : undefined}
            onClick={() => {
              if (!ativo) guardarAncora();
            }}
            className={`inline-flex min-h-11 items-center rounded-full px-3 text-xs font-semibold no-underline transition-[background-color,color] duration-200 sm:px-3.5 pointer-fine:min-h-9 ${
              ativo ? "bg-latao text-noite-fixa" : "text-nevoa hover:text-luar"
            }`}
          >
            {p.rotulo}
          </Link>
        );
      })}
    </div>
  );
}

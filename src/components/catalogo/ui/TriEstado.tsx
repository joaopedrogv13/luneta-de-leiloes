"use client";

import { useId, useRef, type KeyboardEvent } from "react";
import { numero } from "@/lib/catalogo/rotulos";

type Valor = boolean | undefined;
const VALORES: readonly Valor[] = [undefined, true, false];

/**
 * Qualquer / Sim / Não, num controle segmentado (grupo de rádio: setas mudam a escolha, como no
 * sistema). "Sim" mostra quantos imóveis têm a informação. Sem nenhum imóvel com "sim" nesta busca e
 * nada escolhido, o controle fica desligado com a explicação (em vez de sumir sem aviso).
 */
export function TriEstado({
  rotulo,
  valor,
  onChange,
  totalSim,
  rotulos = ["Qualquer", "Sim", "Não"],
  ajuda,
  semDados = "Nenhum imóvel desta busca traz essa informação.",
}: {
  rotulo: string;
  valor: Valor;
  onChange: (v: Valor) => void;
  /** imóveis com "sim" (facetas) */
  totalSim?: number;
  rotulos?: readonly [string, string, string];
  ajuda?: string;
  semDados?: string;
}) {
  const id = useId();
  const grupo = useRef<HTMLDivElement>(null);
  const desligado = totalSim === 0 && valor === undefined;
  const atual = VALORES.indexOf(valor);

  const mover = (e: KeyboardEvent<HTMLButtonElement>) => {
    const passo = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!passo && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    // desligado (nenhum imóvel com a informação): as setas não podem escolher "Sim"/"Não" desabilitados
    if (desligado) return;
    const i = e.key === "Home" ? 0 : e.key === "End" ? 2 : (atual + passo + 3) % 3;
    onChange(VALORES[i]);
    grupo.current?.querySelectorAll<HTMLButtonElement>("[role=radio]")[i]?.focus();
  };

  return (
    <div className="flex flex-col gap-2">
      <span id={`${id}-r`} className="text-[13px] leading-tight font-semibold text-luar">
        {rotulo}
      </span>
      <div
        ref={grupo}
        role="radiogroup"
        aria-labelledby={`${id}-r`}
        aria-describedby={desligado || ajuda ? `${id}-a` : undefined}
        className="grid grid-cols-3 rounded-full border border-nevoa/30 bg-noite/40 p-1"
      >
        {VALORES.map((v, i) => {
          const on = valor === v;
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              disabled={desligado && i > 0}
              onClick={() => onChange(v)}
              onKeyDown={mover}
              className={`inline-flex min-h-11 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-full px-2 text-[13px] leading-none font-medium whitespace-nowrap transition-[background-color,color,box-shadow] duration-150 ease-luneta disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none pointer-fine:min-h-8 ${
                // "Qualquer" escolhido é o estado sem filtro: marcado, mas sem o latão de filtro ativo
                on && i === 0
                  ? "bg-nevoa/20 font-semibold text-luar"
                  : on
                    ? "bg-latao font-semibold text-noite-fixa shadow-[0_1px_8px_rgba(201,162,77,.35)]"
                    : "text-nevoa hover:text-luar"
              }`}
            >
              {rotulos[i]}
              {i === 1 && totalSim !== undefined && totalSim > 0 && (
                <span className={`text-[11.5px] tabular-nums ${on ? "text-noite-fixa/75" : "text-nevoa"}`}>
                  <span className="sr-only">, </span>
                  {numero(totalSim)}
                  <span className="sr-only"> imóveis</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
      {(desligado || ajuda) && (
        <p id={`${id}-a`} className="text-xs leading-snug text-nevoa">
          {desligado ? semDados : ajuda}
        </p>
      )}
    </div>
  );
}

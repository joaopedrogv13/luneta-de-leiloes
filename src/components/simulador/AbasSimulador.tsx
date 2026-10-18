"use client";

import { useSyncExternalStore, type KeyboardEvent } from "react";

export type AbaSimulador = "tabela" | "conta" | "grafico";

const ABAS: { id: AbaSimulador; rotulo: string }[] = [
  { id: "tabela", rotulo: "Tabela" },
  { id: "conta", rotulo: "Conta" },
  { id: "grafico", rotulo: "Gráfico" },
];

/** A aba aberta fica salva no navegador (vale para todos os imóveis); sem armazenamento, só nesta visita. */
const CHAVE = "luneta-sim-aba";
const ouvintes = new Set<() => void>();
let naMemoria: AbaSimulador | null = null;
function ler(): AbaSimulador {
  if (naMemoria) return naMemoria;
  try {
    const v = window.localStorage.getItem(CHAVE);
    if (v === "tabela" || v === "conta" || v === "grafico") return v;
  } catch {
    // sem armazenamento
  }
  return "tabela";
}
function gravar(v: AbaSimulador) {
  naMemoria = v;
  try {
    window.localStorage.setItem(CHAVE, v);
  } catch {
    // sem armazenamento: fica na memória
  }
  for (const f of ouvintes) f();
}
function assinar(aviso: () => void) {
  ouvintes.add(aviso);
  return () => {
    ouvintes.delete(aviso);
  };
}

/** A aba aberta do simulador (no servidor e na hidratação: "Tabela"). */
export function useAbaSimulador(): [AbaSimulador, (v: AbaSimulador) => void] {
  return [useSyncExternalStore(assinar, ler, () => "tabela"), gravar];
}

export const idAba = (a: AbaSimulador) => `sim-aba-${a}`;
export const idPainel = (a: AbaSimulador) => (a === "tabela" ? "sim-painel-tabela" : "sim-detalhe");

/**
 * Celular e tablet (até lg): Tabela (cenários e prazos), Conta (o Detalhe, com a conta linha a linha e os lápis) e
 * Gráfico ("Da venda ao lucro"), num segmentado de 44 px com o comportamento de abas (setas trocam, Home/End). No
 * computador, as três partes ficam abertas uma depois da outra e as abas não aparecem.
 */
export function AbasSimulador({ aba, aoMudar, className = "" }: { aba: AbaSimulador; aoMudar: (a: AbaSimulador) => void; className?: string }) {
  const teclar = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = ABAS.findIndex((a) => a.id === aba);
    const n = e.key === "ArrowRight" ? (i + 1) % ABAS.length : e.key === "ArrowLeft" ? (i - 1 + ABAS.length) % ABAS.length : e.key === "Home" ? 0 : e.key === "End" ? ABAS.length - 1 : -1;
    if (n < 0) return;
    e.preventDefault();
    aoMudar(ABAS[n]!.id);
    document.getElementById(idAba(ABAS[n]!.id))?.focus();
  };
  return (
    <div role="tablist" aria-label="Partes do simulador" className={`grid grid-cols-3 gap-1 rounded-2xl border border-nevoa/25 bg-noite p-1 ${className}`}>
      {ABAS.map((a) => {
        const on = a.id === aba;
        return (
          <button
            key={a.id}
            id={idAba(a.id)}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={idPainel(a.id)}
            tabIndex={on ? 0 : -1}
            onClick={() => aoMudar(a.id)}
            onKeyDown={teclar}
            className={`inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl px-2 text-[14px] font-semibold transition-colors duration-150 motion-reduce:transition-none ${
              on ? "bg-latao text-noite-fixa" : "text-luar hover:bg-nevoa/10"
            }`}
          >
            {a.rotulo}
          </button>
        );
      })}
    </div>
  );
}

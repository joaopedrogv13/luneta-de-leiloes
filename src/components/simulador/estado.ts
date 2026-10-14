"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { limparAjustes, limparMeta, META_PADRAO } from "@/lib/simulador/premissas";
import { CENARIOS, type Ajustes, type Celula, type Meta } from "@/lib/simulador/tipos";

/** Matriz: lance máximo para a meta, ou lucro e ROI com o lance escolhido. */
export type Visao = "teto" | "lucro";

/** O que a pessoa ajustou num imóvel (guardado no navegador, por imóvel). */
export interface EstadoSimulador {
  ajustes: Ajustes;
  meta: Meta;
  celula: Celula;
  visao: Visao;
  /** lance escolhido pela pessoa; null = o lance mínimo atual */
  meuLance: number | null;
}

export const ESTADO_INICIAL: EstadoSimulador = {
  ajustes: {},
  meta: META_PADRAO,
  celula: { cenario: "base", prazo: 1 },
  visao: "teto",
  meuLance: null,
};

const PREFIXO = "luneta:simulador:v1:";

// Guardado em memória também: no modo privado (ou com o armazenamento bloqueado) o simulador segue
// funcionando nesta visita, só não lembra depois.
const memoria = new Map<string, string>();
const ouvintes = new Set<() => void>();

function ler(chave: string): string | null {
  if (memoria.has(chave)) return memoria.get(chave)!;
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function gravar(chave: string, valor: string | null) {
  if (valor === null) memoria.delete(chave);
  else memoria.set(chave, valor);
  try {
    if (valor === null) localStorage.removeItem(chave);
    else localStorage.setItem(chave, valor);
  } catch {
    /* sem armazenamento: fica só na memória */
  }
  ouvintes.forEach((f) => f());
}

function assinar(f: () => void) {
  ouvintes.add(f);
  // outra aba mudou o mesmo imóvel: vale o que ela gravou
  const onStorage = (e: StorageEvent) => {
    if (e.key?.startsWith(PREFIXO)) {
      memoria.delete(e.key);
      f();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    ouvintes.delete(f);
    window.removeEventListener("storage", onStorage);
  };
}

function interpretar(bruto: string | null): EstadoSimulador {
  if (!bruto) return ESTADO_INICIAL;
  try {
    const o = JSON.parse(bruto) as Record<string, unknown>;
    const c = (o.celula ?? {}) as Record<string, unknown>;
    const celula: Celula = {
      cenario: CENARIOS.includes(c.cenario as Celula["cenario"]) ? (c.cenario as Celula["cenario"]) : ESTADO_INICIAL.celula.cenario,
      prazo: Number.isInteger(c.prazo) && (c.prazo as number) >= 0 && (c.prazo as number) < 4 ? (c.prazo as number) : ESTADO_INICIAL.celula.prazo,
    };
    const meuLance = typeof o.meuLance === "number" && Number.isFinite(o.meuLance) && o.meuLance >= 0 && o.meuLance < 1e11 ? o.meuLance : null;
    return {
      ajustes: limparAjustes(o.ajustes),
      meta: limparMeta(o.meta),
      celula,
      visao: o.visao === "lucro" ? "lucro" : "teto",
      meuLance,
    };
  } catch {
    return ESTADO_INICIAL;
  }
}

/**
 * Estado do simulador de um imóvel, guardado no localStorage (com try/catch). No servidor e na primeira
 * pintura vale o estado inicial; logo depois da hidratação entram os ajustes salvos (sem erro de hidratação).
 */
export function useEstadoSimulador(id: string): [EstadoSimulador, (mudar: (atual: EstadoSimulador) => EstadoSimulador) => void] {
  const chave = PREFIXO + id;
  const bruto = useSyncExternalStore(
    assinar,
    () => ler(chave),
    () => null,
  );
  const estado = useMemo(() => interpretar(bruto), [bruto]);
  const atualizar = useCallback(
    (mudar: (atual: EstadoSimulador) => EstadoSimulador) => {
      const novo = mudar(interpretar(ler(chave)));
      gravar(chave, JSON.stringify(novo));
    },
    [chave],
  );
  return [estado, atualizar];
}

/** Tira uma chave dos ajustes (volta ao padrão). */
export function semAjuste(a: Ajustes, ...chaves: (keyof Ajustes)[]): Ajustes {
  const novo = { ...a };
  for (const k of chaves) delete novo[k];
  return novo;
}

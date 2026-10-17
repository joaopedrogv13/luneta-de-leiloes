"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  chaveEstado,
  interpretarEstado,
  PREFIXO_ESTADO,
  PREFIXO_ESTADO_V1,
  serializarEstado,
  type EstadoSimulador,
} from "@/lib/simulador/estado";

export { ESTADO_INICIAL, semAjuste, type EstadoSimulador, type Visao, type LanceDetalhe } from "@/lib/simulador/estado";

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
    if (e.key?.startsWith(PREFIXO_ESTADO)) {
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

/** O texto guardado: a v2, ou a v1 marcada ("v1:" na frente) enquanto a v2 não existir. */
function lerBruto(id: string): string | null {
  const v2 = ler(chaveEstado(id));
  if (v2 !== null) return v2;
  const v1 = ler(PREFIXO_ESTADO_V1 + id);
  return v1 === null ? null : `v1:${v1}`;
}

function interpretarBruto(bruto: string | null): EstadoSimulador {
  if (bruto?.startsWith("v1:")) return interpretarEstado(bruto.slice(3), true);
  return interpretarEstado(bruto);
}

/**
 * Estado do simulador de um imóvel, guardado no localStorage (formato em src/lib/simulador/estado.ts). No
 * servidor e na primeira pintura vale o estado inicial; logo depois da hidratação entram os ajustes salvos
 * (sem erro de hidratação).
 */
export function useEstadoSimulador(id: string): [EstadoSimulador, (mudar: (atual: EstadoSimulador) => EstadoSimulador) => void] {
  const bruto = useSyncExternalStore(
    assinar,
    () => lerBruto(id),
    () => null,
  );
  const estado = useMemo(() => interpretarBruto(bruto), [bruto]);
  const atualizar = useCallback(
    (mudar: (atual: EstadoSimulador) => EstadoSimulador) => {
      const novo = mudar(interpretarBruto(lerBruto(id)));
      gravar(chaveEstado(id), serializarEstado(novo));
    },
    [id],
  );
  return [estado, atualizar];
}

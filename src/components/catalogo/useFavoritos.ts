"use client";

import { useCallback, useSyncExternalStore } from "react";
import { chaveFavoritos } from "@/lib/catalogo/rotas";
import type { Conjunto } from "@/lib/catalogo/tipos";

/**
 * Favoritos da demonstração, guardados no navegador (localStorage, por conjunto) e sincronizados entre a lista,
 * a página do imóvel e outras abas. Sem login ainda: é só a experiência; o alerta de praça é promessa da Luneta.
 * Se o armazenamento falhar (aba privada, bloqueio), os favoritos valem só enquanto a página estiver aberta.
 */
const VAZIO: readonly string[] = [];
const memoria = new Map<string, readonly string[]>();
const ouvintes = new Set<() => void>();

function ler(chave: string): readonly string[] {
  const guardado = memoria.get(chave);
  if (guardado) return guardado;
  let lista: readonly string[] = VAZIO;
  try {
    const bruto = window.localStorage.getItem(chave);
    const valor: unknown = bruto ? JSON.parse(bruto) : [];
    if (Array.isArray(valor)) lista = valor.filter((v): v is string => typeof v === "string").slice(0, 500);
  } catch {
    // sem armazenamento: começa vazio
  }
  memoria.set(chave, lista);
  return lista;
}

function gravar(chave: string, lista: readonly string[]) {
  memoria.set(chave, lista);
  try {
    window.localStorage.setItem(chave, JSON.stringify(lista));
  } catch {
    // sem armazenamento: fica só na memória
  }
  for (const avisar of ouvintes) avisar();
}

function assinar(avisar: () => void) {
  ouvintes.add(avisar);
  const deOutraAba = (e: StorageEvent) => {
    if (!e.key?.startsWith("luneta-favoritos:")) return;
    memoria.delete(e.key);
    avisar();
  };
  window.addEventListener("storage", deOutraAba);
  return () => {
    ouvintes.delete(avisar);
    window.removeEventListener("storage", deOutraAba);
  };
}

export function useFavoritos(conjunto: Conjunto) {
  const chave = chaveFavoritos(conjunto);
  const lista = useSyncExternalStore(
    assinar,
    () => ler(chave),
    () => VAZIO,
  );
  const ehFavorito = useCallback((id: string) => lista.includes(id), [lista]);
  /** Liga/desliga e devolve o novo estado (true = virou favorito). */
  const alternar = useCallback(
    (id: string) => {
      const atual = ler(chave);
      const virou = !atual.includes(id);
      gravar(chave, virou ? [...atual, id] : atual.filter((x) => x !== id));
      return virou;
    },
    [chave],
  );
  return { favoritos: lista, ehFavorito, alternar };
}

"use client";

import { useCallback, useSyncExternalStore } from "react";
import { chaveFavoritos } from "@/lib/catalogo/rotas";
import type { Conjunto } from "@/lib/catalogo/tipos";

/**
 * Favoritos da demonstração, guardados no navegador (localStorage, por conjunto) e sincronizados entre a lista,
 * a página do imóvel e outras abas. Sem login ainda: é só a experiência. O "Avisar por e-mail quando a praça mudar"
 * (rodada 5) é uma lista à parte (useAlertasPraca), também só no navegador: nenhum e-mail é coletado nem enviado
 * enquanto PRODUTO.envioDeEmail for false.
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
    if (!e.key?.startsWith("luneta-favoritos:") && e.key !== CHAVE_ALERTAS) return;
    memoria.delete(e.key);
    avisar();
  };
  window.addEventListener("storage", deOutraAba);
  return () => {
    ouvintes.delete(avisar);
    window.removeEventListener("storage", deOutraAba);
  };
}

/**
 * Os imóveis com o aviso de praça ligado. Uma lista só para os dois conjuntos (os ids da demonstração, "ex-…", e os
 * da base não se repetem), para o botão de favorito não precisar saber em qual conjunto está.
 */
const CHAVE_ALERTAS = "luneta-alerta-praca";

export function useAlertasPraca() {
  const lista = useSyncExternalStore(
    assinar,
    () => ler(CHAVE_ALERTAS),
    () => VAZIO,
  );
  const temAlerta = useCallback((id: string) => lista.includes(id), [lista]);
  /** Liga (true) ou desliga (false) o aviso de um imóvel. */
  const definir = useCallback((id: string, ligado: boolean) => {
    const atual = ler(CHAVE_ALERTAS);
    if (atual.includes(id) === ligado) return;
    gravar(CHAVE_ALERTAS, ligado ? [...atual, id] : atual.filter((x) => x !== id));
  }, []);
  return { temAlerta, definir };
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

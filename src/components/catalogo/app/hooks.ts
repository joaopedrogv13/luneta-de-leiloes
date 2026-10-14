"use client";

import { useSyncExternalStore } from "react";
import { CHAVE_PREFERENCIAS, escreverPreferencias, lerPreferencias, type Preferencias } from "./preferencias";

// ---------------------------------------------------------------------------
// Preferência de vista e mapa (localStorage + cookie espelho)
// ---------------------------------------------------------------------------

const ouvintesPref = new Set<() => void>();
/** sem armazenamento (aba privada, bloqueio): vale só enquanto a página estiver aberta */
let emMemoria: string | null = null;
let ultimoTexto: string | null | undefined;
let ultimoValor: Preferencias = lerPreferencias(null);

function lerCookie(): string | null {
  const achado = document.cookie.split("; ").find((c) => c.startsWith(`${CHAVE_PREFERENCIAS}=`));
  return achado ? decodeURIComponent(achado.slice(CHAVE_PREFERENCIAS.length + 1)) : null;
}

function textoGuardado(): string | null {
  let local: string | null = null;
  try {
    local = window.localStorage.getItem(CHAVE_PREFERENCIAS);
  } catch {
    // localStorage bloqueado: vale o cookie (o mesmo que o servidor leu) ou a memória
  }
  try {
    return local ?? lerCookie() ?? emMemoria;
  } catch {
    return emMemoria;
  }
}

function snapshotPref(): Preferencias {
  const t = textoGuardado();
  if (t !== ultimoTexto) {
    ultimoTexto = t;
    ultimoValor = lerPreferencias(t);
  }
  return ultimoValor;
}

function assinarPref(avisar: () => void) {
  ouvintesPref.add(avisar);
  const deOutraAba = (e: StorageEvent) => {
    if (e.key === CHAVE_PREFERENCIAS) avisar();
  };
  window.addEventListener("storage", deOutraAba);
  return () => {
    ouvintesPref.delete(avisar);
    window.removeEventListener("storage", deOutraAba);
  };
}

/** Preferência salva (no servidor e na hidratação: a do cookie, que a página leu). */
export function usePreferencias(doServidor: Preferencias): Preferencias {
  return useSyncExternalStore(assinarPref, snapshotPref, () => doServidor);
}

/** Salva a vista e/ou o mapa (o que não vier fica como está). */
export function salvarPreferencias(mudanca: Partial<Preferencias>) {
  const texto = escreverPreferencias({ ...snapshotPref(), ...mudanca });
  emMemoria = texto;
  try {
    window.localStorage.setItem(CHAVE_PREFERENCIAS, texto);
  } catch {
    // sem armazenamento: fica na memória (e no cookie, se der)
  }
  try {
    document.cookie = `${CHAVE_PREFERENCIAS}=${encodeURIComponent(texto)}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    // cookies bloqueados: a primeira pintura usa o padrão do aparelho
  }
  for (const avisar of ouvintesPref) avisar();
}

// ---------------------------------------------------------------------------
// Tamanho da tela
// ---------------------------------------------------------------------------

/** A consulta de mídia casa? No servidor e na hidratação, o palpite que a página mandou. */
export function useMidia(consulta: string, doServidor: boolean): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const m = window.matchMedia(consulta);
      m.addEventListener("change", avisar);
      return () => m.removeEventListener("change", avisar);
    },
    () => window.matchMedia(consulta).matches,
    () => doServidor,
  );
}

// ---------------------------------------------------------------------------
// Destaque ligado entre a lista e o mapa (fora do estado do app: passar o mouse não redesenha a página)
// ---------------------------------------------------------------------------

export interface LojaDestaque {
  /** cidade ("MG|Uberlândia") do imóvel sob o mouse (ou com foco) na lista: acende no mapa */
  daLista: string | null;
  /** cidade sob o mouse no mapa: acende os imóveis dela na lista */
  doMapa: string | null;
  definirDaLista(chave: string | null): void;
  definirDoMapa(chave: string | null): void;
  assinar(avisar: () => void): () => void;
}

export function criarLojaDestaque(): LojaDestaque {
  const ouvintes = new Set<() => void>();
  const avisar = () => ouvintes.forEach((f) => f());
  const loja: LojaDestaque = {
    daLista: null,
    doMapa: null,
    definirDaLista(chave) {
      if (loja.daLista === chave) return;
      loja.daLista = chave;
      avisar();
    },
    definirDoMapa(chave) {
      if (loja.doMapa === chave) return;
      loja.doMapa = chave;
      avisar();
    },
    assinar(f) {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
  };
  return loja;
}

/** Este imóvel (pela cidade) está aceso pelo mapa? Só os cartões que mudam de estado são redesenhados. */
export function useAcesoPeloMapa(loja: LojaDestaque, chaveCidade: string): boolean {
  return useSyncExternalStore(
    loja.assinar,
    () => loja.doMapa === chaveCidade,
    () => false,
  );
}

/** Cidade a acender no mapa (a do imóvel sob o mouse na lista). */
export function useDestaqueDaLista(loja: LojaDestaque): string | null {
  return useSyncExternalStore(
    loja.assinar,
    () => loja.daLista,
    () => null,
  );
}

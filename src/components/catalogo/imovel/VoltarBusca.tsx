"use client";

import Link from "next/link";
import { useSyncExternalStore, type MouseEvent } from "react";
import { chaveUltimaBusca, ROTA_LISTA } from "@/lib/catalogo/rotas";
import type { Conjunto, Plano } from "@/lib/catalogo/tipos";
import { IconeVoltar } from "./icones";

/** A lista no plano da página (`?plano=lente` no Lente). */
function listaNoPlano(url: string, plano: Plano) {
  const u = new URL(url, "https://luneta.invalid");
  if (plano === "lente") u.searchParams.set("plano", "lente");
  else u.searchParams.delete("plano");
  return `${u.pathname}${u.search}`;
}

/**
 * A última busca guardada pelo app da lista (sessionStorage, caminho + query), conferida: só um caminho da
 * própria lista deste conjunto (nunca outro site). Sem busca guardada (link direto, outra aba): a lista.
 */
function destino(conjunto: Conjunto, plano: Plano): string {
  const base = ROTA_LISTA[conjunto];
  let guardada: string | null = null;
  try {
    guardada = window.sessionStorage.getItem(chaveUltimaBusca(conjunto));
  } catch {
    // sem armazenamento: vai para a lista
  }
  const valida = !!guardada && guardada.startsWith(base) && (guardada.length === base.length || guardada[base.length] === "?");
  return listaNoPlano(valida ? guardada! : base, plano);
}

const semAssinatura = () => () => {};

type Navegacao = { entries(): { url: string | null }[]; currentEntry: { index: number } | null };

/**
 * A entrada anterior do histórico é esta mesma busca? (Navigation API, onde existe.) Então "voltar" é o
 * voltar do navegador: a lista reaparece na mesma rolagem, sem buscar de novo.
 */
function anteriorEhABusca(alvo: string) {
  try {
    const nav = (window as Window & { navigation?: Navegacao }).navigation;
    const atual = nav?.currentEntry;
    if (!nav || !atual || atual.index < 1) return false;
    const anterior = nav.entries()[atual.index - 1]?.url;
    if (!anterior) return false;
    const a = new URL(anterior);
    const b = new URL(alvo, window.location.origin);
    return a.origin === b.origin && a.pathname === b.pathname && a.search === b.search;
  } catch {
    return false;
  }
}

/** "Voltar à busca": a última busca desta sessão, no plano da página; senão, a lista do conjunto. */
export function VoltarBusca({ conjunto, plano }: { conjunto: Conjunto; plano: Plano }) {
  const href = useSyncExternalStore(
    semAssinatura,
    () => destino(conjunto, plano),
    () => listaNoPlano(ROTA_LISTA[conjunto], plano),
  );
  const voltar = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!anteriorEhABusca(href)) return;
    e.preventDefault();
    window.history.back();
  };
  return (
    <Link
      href={href}
      onClick={voltar}
      prefetch={false}
      className="group/voltar -ml-2 inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-sm font-medium text-nevoa no-underline transition-colors hover:text-luar pointer-fine:min-h-9"
    >
      <span className="grid size-8 place-items-center rounded-full border border-nevoa/25 transition-[border-color,translate] duration-150 ease-luneta group-hover/voltar:-translate-x-0.5 group-hover/voltar:border-nevoa/60 motion-reduce:transition-none">
        <IconeVoltar tamanho={16} />
      </span>
      Voltar à busca
    </Link>
  );
}

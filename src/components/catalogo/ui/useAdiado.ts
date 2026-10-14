"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

/**
 * Chamada adiada (debounce) com "descarregar": `chamar(x)` agenda `fn(x)` para daqui a `ms`; uma nova
 * chamada nesse intervalo substitui a anterior. `descarregar()` executa já o que estiver pendente (ao
 * fechar um pop-up, por exemplo) e `cancelar()` descarta. Ao desmontar, o pendente é executado, para
 * nada que a pessoa fez se perder. `fn` pode mudar a cada render: vale sempre a última.
 */
export function useAdiado<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  const ultimaFn = useRef(fn);
  const pendente = useRef<{ args: A; timer: ReturnType<typeof setTimeout> } | null>(null);

  useEffect(() => {
    ultimaFn.current = fn;
  });

  const descarregar = useCallback(() => {
    const p = pendente.current;
    if (!p) return;
    clearTimeout(p.timer);
    pendente.current = null;
    ultimaFn.current(...p.args);
  }, []);

  const cancelar = useCallback(() => {
    if (pendente.current) clearTimeout(pendente.current.timer);
    pendente.current = null;
  }, []);

  const chamar = useCallback(
    (...args: A) => {
      if (pendente.current) clearTimeout(pendente.current.timer);
      pendente.current = { args, timer: setTimeout(descarregar, ms) };
    },
    [descarregar, ms],
  );

  useEffect(() => descarregar, [descarregar]);

  return useMemo(() => ({ chamar, descarregar, cancelar }), [chamar, descarregar, cancelar]);
}

/** "Reduzir movimento" ligado no sistema? (só no navegador; no servidor, false) */
export function semMovimento() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

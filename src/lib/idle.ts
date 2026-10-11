/**
 * Roda `fn` quando o navegador estiver ocioso (com teto de espera). Devolve o cancelamento.
 * Safari ainda não tem requestIdleCallback: cai num setTimeout curto.
 */
export function whenIdle(fn: () => void, timeout = 1200): () => void {
  const w = window as Window & { requestIdleCallback?: Window["requestIdleCallback"] };
  if (typeof w.requestIdleCallback === "function") {
    const id = w.requestIdleCallback(fn, { timeout });
    return () => w.cancelIdleCallback(id);
  }
  const id = globalThis.setTimeout(fn, 200);
  return () => globalThis.clearTimeout(id);
}

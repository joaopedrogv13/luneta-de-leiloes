"use client";

/**
 * Entradas próprias no histórico do navegador (a folha de filtros no celular: o "voltar" do Android fecha a
 * folha em vez de sair do catálogo). Quando a folha fecha por dentro (×, Esc, "Mostrar"), a entrada dela sai
 * com history.back(); o app ignora esse "voltar" (não restaura a busca antiga) e só grava a URL nova depois
 * dele, senão a entrada da busca nova cairia antes do "voltar" e seria desfeita por ele.
 */

let voltasProprias = 0;
const esperando: (() => void)[] = [];

/** Sai da entrada que a própria interface criou (history.back), avisando o app para não restaurar nada. */
export function voltarEntradaPropria() {
  voltasProprias++;
  window.history.back();
  // se o navegador não devolver o popstate (aba sem histórico), não fica preso
  window.setTimeout(() => {
    if (voltasProprias > 0) consumirVoltaPropria();
  }, 600);
}

/**
 * Chame no ouvinte de popstate: true se este "voltar" foi da própria interface (não restaure nada). Libera
 * as escritas de URL que esperavam por ele.
 */
export function consumirVoltaPropria(): boolean {
  if (voltasProprias === 0) return false;
  voltasProprias--;
  if (voltasProprias === 0) for (const f of esperando.splice(0)) f();
  return true;
}

/** Roda `f` agora ou, com um "voltar" próprio a caminho, logo depois dele. */
export function depoisDoHistorico(f: () => void) {
  if (voltasProprias === 0) f();
  else esperando.push(f);
}

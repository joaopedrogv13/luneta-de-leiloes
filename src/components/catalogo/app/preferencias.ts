/**
 * Preferência de vista ("lista" ou "cards") e do mapa (visível ou escondido), por pessoa e aparelho.
 * Guardada no navegador (localStorage, a fonte de verdade) e espelhada num cookie, para o servidor já
 * desenhar a primeira pintura na vista escolhida (sem trocar de layout depois da hidratação).
 * Puro (sem React, sem window): a página no servidor e o app no navegador usam as mesmas funções.
 */
import type { Vista } from "../../../lib/catalogo/url";

/** Nome do cookie e da chave do localStorage. */
export const CHAVE_PREFERENCIAS = "luneta-vista";

export interface Preferencias {
  /** null = ainda não escolheu (vale o padrão do aparelho: lista no computador, cards no celular) */
  vista: Vista | null;
  /** null = ainda não escolheu (vale o padrão do aparelho: visível no computador, escondido no celular) */
  mapa: boolean | null;
}

export const SEM_PREFERENCIAS: Preferencias = { vista: null, mapa: null };

/** "cards.1" → cards e mapa visível; "lista.-" → lista, mapa no padrão; "-.0" → vista no padrão, mapa escondido. */
export function lerPreferencias(texto: string | null | undefined): Preferencias {
  if (!texto) return SEM_PREFERENCIAS;
  const [v, m] = texto.slice(0, 16).split(".");
  return {
    vista: v === "lista" || v === "cards" ? v : null,
    mapa: m === "1" ? true : m === "0" ? false : null,
  };
}

export function escreverPreferencias(p: Preferencias): string {
  return `${p.vista ?? "-"}.${p.mapa === null ? "-" : p.mapa ? "1" : "0"}`;
}

/** O app considera "celular" abaixo de md (768 px): cards por padrão e mapa escondido. */
export const CONSULTA_CELULAR = "(max-width: 767.98px)";
/** A partir de lg (1024 px) a lista tem o mapa numa coluna fixa à direita; abaixo, numa faixa em cima. */
export const CONSULTA_COMPUTADOR = "(min-width: 1024px)";

/**
 * Palpite do servidor, pelo navegador que pediu a página: celular? Chromium manda `Sec-CH-UA-Mobile`;
 * os demais, o User-Agent ("Mobi" nos celulares Android, iPhone, iPod). Tablet conta como computador.
 */
export function pareceCelular(cabecalhos: { get(nome: string): string | null }): boolean {
  const dica = cabecalhos.get("sec-ch-ua-mobile");
  if (dica === "?1") return true;
  if (dica === "?0") return false;
  return /Mobi|iPhone|iPod/i.test(cabecalhos.get("user-agent") ?? "");
}

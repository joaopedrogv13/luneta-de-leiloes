/**
 * Preferências de tela da página do imóvel, guardadas no navegador (localStorage, com try/catch):
 * - o resumo fixo da direita recolhido (computador). Espelhado num cookie, para o servidor já desenhar a página
 *   com o resumo recolhido (sem ele "piscar" aberto antes de recolher), como a vista do catálogo;
 * - a barra do lance minimizada (celular);
 * - "Como salvar o PDF" já visto (relatório), também em cookie.
 * Sem "use client": o servidor lê o nome do cookie daqui; as funções de gravar só rodam no navegador.
 */

export const CHAVE_RESUMO_LATERAL = "luneta-resumo-lateral";
export const CHAVE_BARRA_LANCE = "luneta-barra-lance";
/**
 * "Como salvar o PDF" (relatório) já foi mostrado aberto neste navegador? Cookie, para o servidor desenhar a
 * barra já aberta na primeira visita: aberta depois da hidratação, ela empurrava o relatório 89 px para baixo.
 */
export const CHAVE_AJUDA_PDF = "luneta-pdf-ajuda-vista";

/** O valor do cookie/localStorage quando o resumo está recolhido. */
export const RECOLHIDO = "recolhido";

export function lerPreferencia(chave: string): string | null {
  try {
    return window.localStorage.getItem(chave);
  } catch {
    return null;
  }
}

/** Valor do cookie de mesmo nome (null sem ele ou com cookies bloqueados). */
export function lerCookie(chave: string): string | null {
  try {
    const par = document.cookie.split("; ").find((c) => c.startsWith(`${chave}=`));
    return par ? decodeURIComponent(par.slice(chave.length + 1)) : null;
  } catch {
    return null;
  }
}

/** Grava (ou apaga, com null) no localStorage e, com `cookie`, também no cookie de mesmo nome (1 ano). */
export function gravarPreferencia(chave: string, valor: string | null, { cookie = false }: { cookie?: boolean } = {}) {
  try {
    if (valor === null) window.localStorage.removeItem(chave);
    else window.localStorage.setItem(chave, valor);
  } catch {
    // sem armazenamento (aba anônima, bloqueio): vale só nesta visita
  }
  if (!cookie) return;
  try {
    document.cookie = valor === null ? `${chave}=; path=/; max-age=0; samesite=lax` : `${chave}=${encodeURIComponent(valor)}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    // cookies bloqueados: a primeira pintura usa o padrão (resumo aberto)
  }
}

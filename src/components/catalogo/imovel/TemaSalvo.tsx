"use client";

import { useLayoutEffect } from "react";

/**
 * O 404 do imóvel (notFound() fora de um Suspense) não vem pronto do servidor: o Next manda a "casca de erro"
 * (<html id="__next_error__">, sem o script do tema no <head>) e o documento inteiro é desenhado no navegador,
 * com o <html data-theme="dark"> do layout raiz. Aqui o tema salvo volta antes da primeira pintura (efeito de
 * layout); o ThemeToggle confere o tema de novo logo depois do commit e acompanha. Nas páginas normais, o tema
 * já está certo e nada muda.
 */
export function TemaSalvo() {
  useLayoutEffect(() => {
    try {
      const t = window.localStorage.getItem("luneta-theme");
      const html = document.documentElement;
      if ((t === "light" || t === "dark") && html.dataset.theme !== t) html.dataset.theme = t;
    } catch {
      // sem armazenamento: fica o tema padrão
    }
  }, []);
  return null;
}

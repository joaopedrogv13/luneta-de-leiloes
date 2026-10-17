"use client";

import { useEffect, useRef } from "react";

/** Altura útil da página A4 com as margens da @page (297 − 17 − 17 mm), em px CSS (96 por polegada). */
const ALTURA_UTIL = ((297 - 34) * 96) / 25.4;
/** Largura da folha na tela (210 mm): só nela a medida da tela vale para a impressão. */
const LARGURA_A4 = (210 * 96) / 25.4;
/**
 * Folga para a diferença entre a tela e a página impressa (arredondamento das linhas, quebra de texto): a capa que
 * passa da página empurra o resultado inteiro para a página 2 (ele não se parte) e sobram duas páginas pela metade.
 */
const FOLGA = 12;

/**
 * Fica no fim da capa e garante que ela caiba numa página A4. Se passar (título longo, foto, muitos avisos), a capa
 * fica compacta (`data-compacta`: título, foto e espaços menores); se nem assim couber, ela deixa de forçar a
 * quebra depois dela (`data-transborda`) e o corpo continua logo em seguida, em vez de sobrar uma página quase
 * vazia.
 *
 * A medida da tela só vale com a folha em largura A4 (computador e tablet deitado). Em tela estreita (celular), a
 * folha é fluida; na hora de imprimir (`beforeprint`, que o "Salvar em PDF", o Ctrl+P e o menu do navegador
 * disparam), a tela passa por um instante ao desenho A4 (`data-a4` na raiz: as regras do celular deixam de valer),
 * mede, marca a capa e volta ao normal depois da impressão (`afterprint`).
 */
export function MedidaCapa() {
  const marco = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const fim = marco.current;
    const folha = fim?.parentElement;
    if (!fim || !folha) return;
    const raiz = folha.closest<HTMLElement>("[data-relatorio-tela]");
    const altura = () => {
      const caixa = folha.getBoundingClientRect();
      return fim.getBoundingClientRect().top - caixa.top - Number.parseFloat(getComputedStyle(folha).paddingTop || "0");
    };
    const cabe = () => altura() <= ALTURA_UTIL - FOLGA;
    const imprimindo = () => window.matchMedia?.("print").matches ?? false;
    const medir = () => {
      // com a página no desenho da impressão (largura do papel), a medida da tela não vale: fica a marca de antes
      if (imprimindo()) return;
      folha.removeAttribute("data-compacta");
      folha.removeAttribute("data-transborda");
      if (Math.abs(folha.getBoundingClientRect().width - LARGURA_A4) > 2) return;
      if (cabe()) return;
      folha.setAttribute("data-compacta", "");
      if (cabe()) return;
      folha.setAttribute("data-transborda", "");
    };
    let quadro = 0;
    // mede no quadro seguinte (fora do callback do observador: mexer no tamanho ali dentro dá laço)
    const pedir = () => {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(medir);
    };
    // impressão: mede já (a leitura do tamanho força o desenho), no desenho A4 se a tela for estreita
    const antesDeImprimir = () => {
      cancelAnimationFrame(quadro);
      if (raiz && Math.abs(folha.getBoundingClientRect().width - LARGURA_A4) > 2) raiz.setAttribute("data-a4", "");
      medir();
    };
    const depoisDeImprimir = () => {
      if (raiz?.hasAttribute("data-a4")) {
        raiz.removeAttribute("data-a4");
        pedir();
      }
    };
    // durante a impressão, o observador vê a folha mudar de largura (papel): não remede
    const ro = new ResizeObserver(() => {
      if (!imprimindo()) pedir();
    });
    ro.observe(folha);
    for (const filho of Array.from(folha.children)) ro.observe(filho);
    void document.fonts?.ready.then(pedir);
    window.addEventListener("beforeprint", antesDeImprimir);
    window.addEventListener("afterprint", depoisDeImprimir);
    return () => {
      cancelAnimationFrame(quadro);
      ro.disconnect();
      window.removeEventListener("beforeprint", antesDeImprimir);
      window.removeEventListener("afterprint", depoisDeImprimir);
    };
  }, []);
  return <span ref={marco} aria-hidden="true" style={{ display: "block", height: 0 }} />;
}

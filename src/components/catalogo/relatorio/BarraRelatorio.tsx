"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { IconeImprimir, IconeVoltar } from "./icones";

const espera = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

/** Espera as fontes e as fotos do relatório (carregadas ou falhas), com um limite de tempo. */
async function relatorioPronto(limite = 4000) {
  const fotos = Array.from(document.querySelectorAll<HTMLImageElement>("[data-relatorio] img"));
  const carregadas = Promise.all([
    document.fonts?.ready,
    ...fotos.map((img) =>
      img.complete
        ? null
        : new Promise<void>((ok) => {
            img.addEventListener("load", () => ok(), { once: true });
            img.addEventListener("error", () => ok(), { once: true });
          }),
    ),
  ]);
  await Promise.race([carregadas, espera(limite)]);
  // a conta com os ajustes salvos entra logo depois da hidratação: um respiro para ela pintar
  await espera(350);
}

/**
 * Barra da tela (some na impressão): voltar ao imóvel, "Salvar em PDF" (abre a impressão do navegador) e como
 * salvar no computador e no celular. Com `?imprimir=1`, a impressão abre sozinha quando o relatório fica pronto
 * (e o parâmetro sai da URL, para recarregar não abrir de novo).
 */
export function BarraRelatorio({ voltar, imprimir }: { voltar: string; imprimir: boolean }) {
  const botao = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!imprimir) return;
    let vivo = true;
    void relatorioPronto().then(() => {
      if (!vivo) return;
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("imprimir");
        window.history.replaceState(window.history.state, "", url);
      } catch {
        /* sem history: segue */
      }
      window.print();
    });
    return () => {
      vivo = false;
    };
  }, [imprimir]);

  const salvar = async () => {
    botao.current?.setAttribute("aria-busy", "true");
    await relatorioPronto(2500);
    botao.current?.removeAttribute("aria-busy");
    window.print();
  };

  return (
    <div className="sticky top-0 z-30 border-b border-nevoa/15 bg-noite/92 backdrop-blur-md print:hidden">
      <div className="mx-auto flex max-w-[860px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
        <Link
          href={voltar}
          prefetch={false}
          className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-[14px] font-medium text-nevoa transition-colors hover:text-luar pointer-fine:min-h-9"
        >
          <IconeVoltar className="size-4" />
          Voltar ao imóvel
        </Link>
        <p className="order-last hidden min-w-0 flex-1 text-center text-[13px] leading-snug text-nevoa md:order-none md:block">
          <span className="font-semibold text-luar">Relatório de simulação</span> · confira e salve em PDF
        </p>
        <button ref={botao} type="button" onClick={salvar} className="btn-primary min-h-11 gap-2 px-5 text-[14.5px] pointer-fine:min-h-10">
          <IconeImprimir className="size-[18px]" />
          Salvar em PDF
        </button>
      </div>
      <div className="mx-auto max-w-[860px] px-4 pb-2.5 sm:px-6">
        <details className="group text-[12.5px] leading-relaxed text-nevoa">
          <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1.5 font-medium text-latao-texto underline-offset-4 hover:underline [&::-webkit-details-marker]:hidden">
            Como salvar o PDF
            <span aria-hidden="true" className="transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none">
              ▾
            </span>
          </summary>
          <ul className="mt-1 mb-1 grid gap-1 sm:grid-cols-3 sm:gap-4">
            <li>
              <strong className="font-semibold text-luar">Computador:</strong> em “Destino”, escolha “Salvar como PDF”. Desmarque “Cabeçalhos e rodapés”: o
              relatório já tem os seus, com o número da página.
            </li>
            <li>
              <strong className="font-semibold text-luar">Android:</strong> toque em “Salvar em PDF”, escolha a impressora “Salvar como PDF” e toque no botão
              PDF.
            </li>
            <li>
              <strong className="font-semibold text-luar">iPhone:</strong> toque em “Salvar em PDF” e, na tela de impressão, em Compartilhar (quadrado com seta)
              e “Salvar em Arquivos”.
            </li>
          </ul>
        </details>
      </div>
    </div>
  );
}

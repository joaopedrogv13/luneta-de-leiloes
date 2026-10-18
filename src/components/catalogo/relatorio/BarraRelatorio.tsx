"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { CHAVE_AJUDA_PDF, gravarPreferencia } from "@/components/catalogo/imovel/preferencias";
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
 * Barra da tela (some na impressão): voltar ao imóvel e "Salvar em PDF" (abre a impressão do navegador), numa linha
 * só e fixa no topo; logo abaixo, rolando com a página, "Como salvar o PDF" no computador e no celular (fixo, aberto,
 * ocupava quase metade da tela do celular). Com `?imprimir=1`, a impressão abre sozinha quando o relatório fica pronto
 * (e o parâmetro sai da URL, para recarregar não abrir de novo).
 */
export function BarraRelatorio({ voltar, imprimir, ajudaAberta = false }: { voltar: string; imprimir: boolean; ajudaAberta?: boolean }) {
  const botao = useRef<HTMLButtonElement>(null);
  // primeira visita (sem o cookie): a ajuda já veio aberta do servidor; marca como vista para as próximas. Antes,
  // ela abria depois da hidratação (localStorage) e empurrava o relatório para baixo (CLS de 0,05 a 0,09)
  useEffect(() => {
    if (ajudaAberta) gravarPreferencia(CHAVE_AJUDA_PDF, "1", { cookie: true });
  }, [ajudaAberta]);

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
    <>
      <div className="sticky top-0 z-30 border-b border-nevoa/15 bg-noite/92 backdrop-blur-md print:hidden">
        <div className="mx-auto flex max-w-[860px] flex-nowrap items-center justify-between gap-x-3 px-4 py-2.5 sm:gap-x-4 sm:px-6">
          <Link
            href={voltar}
            prefetch={false}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-2 text-[14px] font-medium whitespace-nowrap text-nevoa transition-colors hover:text-luar sm:-ml-2 pointer-fine:min-h-9"
          >
            <IconeVoltar className="size-4" />
            Voltar ao imóvel
          </Link>
          <p className="order-last hidden min-w-0 flex-1 text-center text-[13px] leading-snug text-nevoa md:order-none md:block">
            <span className="font-semibold text-luar">Relatório de simulação</span> · confira e salve em PDF
          </p>
          <button
            ref={botao}
            type="button"
            onClick={salvar}
            className="btn-primary min-h-11 shrink-0 gap-2 px-5 text-[14.5px] whitespace-nowrap max-[400px]:px-4 pointer-fine:min-h-10"
          >
            <IconeImprimir className="size-[18px]" />
            <span className="max-[400px]:hidden">Salvar em PDF</span>
            <span className="hidden max-[400px]:inline">Salvar PDF</span>
          </button>
        </div>
      </div>
      <div className="border-b border-nevoa/15 bg-noite/92 print:hidden">
        <div className="mx-auto max-w-[860px] px-4 py-1 sm:px-6">
          {/* aberto na primeira visita (depois, fechado: abrir é um toque) */}
          <details open={ajudaAberta || undefined} className="group text-sm leading-relaxed text-nevoa sm:text-[12.5px]">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 font-medium text-latao-texto underline-offset-4 hover:underline pointer-fine:min-h-8 [&::-webkit-details-marker]:hidden">
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
    </>
  );
}

"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import { RECURSOS_LUNETA } from "@/lib/catalogo/planos";
import type { Recurso } from "@/lib/catalogo/tipos";
import { IconeCadeado } from "../ui/icones";
import { usePedirLuneta, type PedirLuneta } from "./convite";
import { PreviaRecurso } from "./Previas";
import { ROTA_PLANOS } from "./textos";

export type VarianteRecurso = "secao" | "compacto" | "linha" | "faixa";

/**
 * A chamada da Luneta no lugar de um recurso que o plano Lente não vê. Um componente só para a página do imóvel
 * (simulador, região, nota, riscos), o relatório, o painel de filtros e as ordens:
 * - "secao": a prévia DESENHADA e borrada (formas fixas, nunca o dado; ver Previas.tsx), "Plano Luneta", o nome e a
 *   chamada do recurso (RECURSOS_LUNETA), "Conhecer a Luneta" (abre a janela com o texto do recurso) e "Comparar os
 *   planos" (a tabela da landing);
 * - "compacto": o mesmo, menor (dentro do painel de filtros);
 * - "linha": um botão de uma linha com o cadeado (um filtro avançado no painel): o clique abre a janela, sem filtrar;
 * - "faixa": a chamada curta da página do imóvel depois da primeira (cadeado, o nome, uma frase e "Ver na Luneta" em
 *   contorno, sem a prévia nem "Comparar os planos"). Só a primeira chamada da página (Riscos) é "secao": quatro
 *   cartões grandes iguais, cada um com o botão dourado, viravam uma parede de convites (revisão final da rodada 4,
 *   UX-03). Com `titulo={null}`, sem o nome (quando ele repetiria o título da seção).
 *
 * A janela vem do provedor da página (usePedirLuneta) ou de `onConhecer`. Igual nos dois temas (só os tokens), cabe em
 * 360 px, alvos de 44 px e tudo pelo teclado (botão e link comuns; o foco volta ao botão quando a janela fecha).
 */
export function RecursoLuneta({
  recurso,
  variante = "secao",
  titulo,
  texto,
  extra,
  comoTitulo = "h3",
  onConhecer,
  className = "",
}: {
  recurso: Recurso;
  variante?: VarianteRecurso;
  /** o nome (padrão: RECURSOS_LUNETA[recurso].rotulo); null na "faixa": sem nome (o título da seção já diz) */
  titulo?: ReactNode | null;
  /** a chamada (padrão: RECURSOS_LUNETA[recurso].chamada; na "linha", só aparece se vier) */
  texto?: ReactNode;
  /** uma linha a mais, abaixo da chamada (o que vale para este imóvel, um link) */
  extra?: ReactNode;
  /** o elemento do nome: h3 numa seção da página; "p" dentro de um painel que já tem os títulos */
  comoTitulo?: "h2" | "h3" | "p";
  /** abre a janela (padrão: o provedor da página) */
  onConhecer?: PedirLuneta;
  className?: string;
}) {
  const doContexto = usePedirLuneta();
  const pedir = onConhecer ?? doContexto;
  const r = RECURSOS_LUNETA[recurso];
  const nome = titulo === undefined ? r.rotulo : titulo;
  const conhecer = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    pedir?.(e.currentTarget, recurso);
  };

  if (variante === "linha") {
    return (
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={conhecer}
        data-recurso-luneta={recurso}
        className={`group/linha flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-latao/45 bg-latao/[0.04] px-3.5 py-2.5 text-left transition-[background-color,border-color] duration-150 hover:border-latao hover:bg-latao/[0.09] motion-reduce:transition-none ${className}`}
      >
        <span aria-hidden="true" className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-latao/55 text-latao-texto">
          <IconeCadeado tamanho={14} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] leading-snug font-medium text-luar">{nome}</span>
          {texto && <span className="mt-0.5 block text-[12.5px] leading-snug text-nevoa">{texto}</span>}
        </span>
        <span aria-hidden="true" className="shrink-0 text-[10px] font-semibold tracking-[0.1em] text-latao-texto uppercase">
          Luneta
        </span>
        <span className="sr-only">: recurso do plano Luneta. Conhecer o plano</span>
      </button>
    );
  }

  const Titulo = comoTitulo;
  if (variante === "faixa") {
    return (
      <div
        data-recurso-luneta={recurso}
        className={`flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-latao/35 bg-latao/[0.04] px-4 py-3.5 sm:flex-nowrap sm:px-5 ${className}`}
      >
        <span aria-hidden="true" className="inline-flex size-9 shrink-0 items-center justify-center self-start rounded-full border border-latao/55 text-latao-texto sm:self-center">
          <IconeCadeado tamanho={15} />
        </span>
        <div className="min-w-0 flex-1 basis-[calc(100%-52px)] sm:basis-auto">
          {nome !== null && <Titulo className="text-[15px] leading-snug font-semibold text-luar">{nome}</Titulo>}
          <p className={`text-[14px] leading-snug text-nevoa ${nome !== null ? "mt-0.5" : ""}`}>
            <span className="font-semibold text-latao-texto">Na Luneta: </span>
            {texto ?? r.chamada}
          </p>
          {extra && <div className="mt-1 text-[13px] leading-snug text-nevoa">{extra}</div>}
        </div>
        <button type="button" aria-haspopup="dialog" onClick={conhecer} className="btn-outline !min-h-11 shrink-0 !px-5 !text-[14px] max-sm:w-full">
          Ver na Luneta
          <span className="sr-only">: {typeof nome === "string" ? nome : r.rotulo}</span>
        </button>
      </div>
    );
  }

  const compacto = variante === "compacto";
  return (
    <div
      data-recurso-luneta={recurso}
      className={`relative overflow-hidden border border-latao/40 bg-tinta ${compacto ? "rounded-2xl" : "rounded-3xl"} [[data-theme=light]_&]:shadow-[0_1px_2px_rgba(15,24,48,.05),0_10px_28px_-14px_rgba(15,24,48,.16)] ${className}`}
    >
      {/* a prévia: desenho fixo, borrado e esmaecido para baixo; fora da árvore de acessibilidade */}
      <div
        aria-hidden="true"
        className={`pointer-events-none overflow-hidden opacity-80 blur-[3px] select-none [mask-image:linear-gradient(180deg,#000_35%,transparent)] ${
          compacto ? "h-[76px] px-4 pt-4" : "h-[108px] px-5 pt-5 sm:h-[124px] sm:px-8 sm:pt-7"
        }`}
      >
        <PreviaRecurso recurso={recurso} />
      </div>
      <div className={`flex flex-col items-start ${compacto ? "gap-2 px-4 pb-4" : "gap-2.5 px-5 pb-6 sm:px-8 sm:pb-8"}`}>
        <span className="inline-flex items-center gap-1.5 text-[12px] leading-none font-semibold tracking-[0.12em] text-latao-texto uppercase">
          <IconeCadeado tamanho={13} />
          Plano Luneta
        </span>
        <Titulo
          className={`font-display leading-snug font-bold tracking-[-0.01em] text-balance text-luar ${compacto ? "text-[16px]" : "text-[20px] sm:text-[22px]"}`}
        >
          {nome}
        </Titulo>
        <p className={`max-w-[60ch] leading-relaxed text-nevoa ${compacto ? "text-[13px]" : "text-[14.5px] max-sm:text-[15px]"}`}>{texto ?? r.chamada}</p>
        {extra && <div className={`max-w-[60ch] leading-relaxed text-nevoa ${compacto ? "text-[13px]" : "text-[14px]"}`}>{extra}</div>}
        <div className={`flex w-full flex-wrap items-center gap-x-5 gap-y-1.5 ${compacto ? "mt-1" : "mt-2"}`}>
          {/* no celular, em contorno: na página do imóvel o dourado fica só para "Ver anúncio" (UX-03) */}
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={conhecer}
            className={`btn-primary ${compacto ? "w-full sm:w-auto" : "max-sm:w-full max-sm:border max-sm:border-latao/70 max-sm:bg-transparent max-sm:text-latao-texto max-sm:hover:bg-latao/12 max-sm:hover:shadow-none"}`}
          >
            Conhecer a Luneta
          </button>
          <Link
            href={ROTA_PLANOS}
            prefetch={false}
            className="inline-flex min-h-11 items-center text-[14px] font-semibold text-latao-texto underline-offset-4 hover:text-luar hover:underline max-sm:mx-auto"
          >
            Comparar os planos
          </Link>
        </div>
      </div>
    </div>
  );
}

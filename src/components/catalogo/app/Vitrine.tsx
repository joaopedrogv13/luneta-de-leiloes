"use client";

import Link from "next/link";
import { memo } from "react";
import { SeloCancelamento } from "@/components/ui/SeloCancelamento";
import { rotaImovel } from "@/lib/catalogo/rotas";
import type { Conjunto, ImovelResumo, Plano, Recurso, ResumoVitrine } from "@/lib/catalogo/tipos";
import {
  BOTAO_VITRINE,
  COMO_ESCOLHEMOS,
  CTA_VITRINE,
  EXEMPLOS_TEXTO,
  EXEMPLOS_TITULO,
  fraseFiltrosVitrine,
  fraseVitrine,
} from "@/lib/catalogo/vitrine-textos";
import { CartaoImovel } from "../cartoes";
import { ROTA_PLANOS } from "../planos/textos";

/** O ícone da vitrine: uma lente com uma estrela (os "melhores" da base). */
function IconeVitrine({ tamanho = 18 }: { tamanho?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={tamanho} height={tamanho} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="7" />
      <path d="m15.6 15.6 5 5" />
      <path d="m10.5 7 1.1 2.3 2.4.3-1.8 1.6.5 2.4-2.2-1.2-2.2 1.2.5-2.4-1.8-1.6 2.4-.3z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * Topo da lista na vitrine da demonstração (/assinante): "Você está vendo 10 de 21.230 imóveis reais da base", o convite
 * ("Para ver todos, com filtros, mapa e alertas, assine."), o botão para os planos com o "Cancele grátis em até 7 dias"
 * e, aberto no clique, como os 10 foram escolhidos. Com filtros, a linha "Com estes filtros: 2 dos 10 aqui e 1.234 na
 * base completa" mostra o que a assinatura acrescenta.
 */
export function AvisoVitrine({ vitrine, total, filtrando }: { vitrine: ResumoVitrine; total: number; filtrando: boolean }) {
  return (
    <section
      aria-label="Sobre esta vitrine"
      className="rounded-2xl border border-latao/45 bg-tinta px-4 py-4 sm:px-5 [[data-theme=light]_&]:shadow-[0_1px_2px_rgba(15,24,48,.05),0_8px_24px_-12px_rgba(15,24,48,.14)]"
    >
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-latao/80 text-latao-texto max-sm:hidden">
          <IconeVitrine />
        </span>
        <div className="min-w-[230px] flex-1">
          <p className="font-display text-[15.5px] leading-snug font-bold text-luar sm:text-base">{fraseVitrine(vitrine.mostrados, vitrine.totalBase)}</p>
          <p className="mt-0.5 text-[13.5px] leading-normal text-nevoa">{CTA_VITRINE}</p>
          {filtrando && (
            <p className="mt-1.5 text-[13px] leading-normal font-medium text-luar tabular-nums">{fraseFiltrosVitrine(total, vitrine.mostrados, vitrine.naBase)}</p>
          )}
        </div>
        <div className="flex flex-col items-start gap-1.5 max-sm:w-full sm:items-center">
          <Link href={ROTA_PLANOS} prefetch={false} className="btn-primary !min-h-11 !px-5 !text-[13.5px] max-sm:w-full">
            {BOTAO_VITRINE}
          </Link>
          <SeloCancelamento variante="linha" className="!text-[12.5px]" />
        </div>
      </div>
      <details className="group/como mt-3 border-t border-nevoa/12 pt-2.5">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-md text-[13px] font-semibold text-latao-texto underline-offset-4 hover:underline pointer-fine:min-h-8 [&::-webkit-details-marker]:hidden">
          <span aria-hidden="true" className="inline-block transition-transform duration-200 group-open/como:rotate-90 motion-reduce:transition-none">
            ›
          </span>
          Como escolhemos estes {vitrine.mostrados}
        </summary>
        <ul className="mt-1.5 grid gap-1.5 pb-1 text-[13px] leading-normal text-nevoa sm:grid-cols-2 sm:gap-x-6">
          {COMO_ESCOLHEMOS.map((c) => (
            <li key={c} className="flex gap-2">
              <span aria-hidden="true" className="mt-[7px] size-1.5 shrink-0 rounded-full bg-latao" />
              {c}
            </li>
          ))}
          <li className="flex gap-2 sm:col-span-2">
            <span aria-hidden="true" className="mt-[7px] size-1.5 shrink-0 rounded-full bg-nevoa/60" />A escolha é refeita a cada atualização da base. Não é recomendação de compra: confira sempre o edital.
          </li>
        </ul>
      </details>
    </section>
  );
}

/** Fim da lista na vitrine: o mesmo convite, maior, com os planos e o cancelamento grátis. */
export function RodapeVitrine({ vitrine }: { vitrine: ResumoVitrine }) {
  return (
    <aside
      aria-labelledby="vitrine-fim"
      className="relative isolate overflow-hidden rounded-3xl border border-latao/45 bg-tinta px-5 py-8 text-center sm:px-8 sm:py-10 [[data-theme=light]_&]:shadow-[0_1px_2px_rgba(15,24,48,.05),0_8px_24px_-12px_rgba(15,24,48,.14)]"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(70%_90%_at_50%_120%,rgba(201,162,77,.16),transparent_70%)]" />
      <p className="text-[11px] font-semibold tracking-[0.14em] text-latao-texto uppercase">Vitrine da demonstração</p>
      <h2 id="vitrine-fim" className="mx-auto mt-2 max-w-[28ch] font-display text-[clamp(20px,2.4vw,26px)] leading-tight font-bold tracking-[-0.015em] text-luar">
        {fraseVitrine(vitrine.mostrados, vitrine.totalBase)}
      </h2>
      <p className="mx-auto mt-2 max-w-[52ch] text-[14.5px] leading-relaxed text-nevoa">{CTA_VITRINE}</p>
      <div className="mt-5 flex flex-col items-center gap-3">
        <Link href={ROTA_PLANOS} prefetch={false} className="btn-primary !min-h-12 !px-7 max-sm:w-full">
          {BOTAO_VITRINE}
        </Link>
        <SeloCancelamento />
      </div>
    </aside>
  );
}

/**
 * Os exemplos fictícios da demonstração, à parte da vitrine real: servem para ver os selos e as tags (os da base real
 * estão em análise) e são o destino dos links da landing (/assinante/imovel/ex-*). Fora dos filtros e do mapa; com o
 * plano aplicado pelo servidor (no Lente, sem tags e selo). Cada foto é ilustrativa e rotulada no cartão.
 */
export const ExemplosFicticios = memo(function ExemplosFicticios({
  exemplos,
  plano,
  conjunto,
  ehFavorito,
  onFavoritar,
  onUpsell,
}: {
  exemplos: ImovelResumo[];
  plano: Plano;
  conjunto: Conjunto;
  ehFavorito: (id: string) => boolean;
  onFavoritar: (id: string) => void;
  onUpsell: (quem: HTMLElement, recurso?: Recurso | null) => void;
}) {
  if (exemplos.length === 0) return null;
  return (
    <section aria-labelledby="exemplos-ficticios" className="mt-4 border-t border-nevoa/15 pt-8">
      <h2 id="exemplos-ficticios" className="font-display text-[19px] leading-tight font-bold tracking-[-0.01em] text-luar sm:text-[21px]">
        {EXEMPLOS_TITULO}
      </h2>
      <p className="mt-1.5 max-w-[72ch] text-[13.5px] leading-relaxed text-nevoa">{EXEMPLOS_TEXTO}</p>
      {/* celular: uma fila que rola de lado (os 6 empilhados alongavam a página em ~3.500 px); a partir de 620 px, a
          mesma grade dos cards da lista */}
      <div className="@container mt-5">
        <ul
          aria-label="Exemplos fictícios"
          className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:thin] sm:-mx-6 sm:scroll-px-6 sm:px-6 @min-[620px]:mx-0 @min-[620px]:grid @min-[620px]:grid-cols-2 @min-[620px]:gap-5 @min-[620px]:overflow-visible @min-[620px]:px-0 @min-[620px]:pb-0 @min-[940px]:grid-cols-3 @min-[1260px]:grid-cols-4"
        >
          {exemplos.map((imovel) => (
            <li key={imovel.id} className="w-[84%] max-w-[340px] min-w-0 shrink-0 snap-start @min-[620px]:w-auto @min-[620px]:max-w-none">
              <CartaoImovel
                imovel={imovel}
                plano={plano}
                hrefImovel={rotaImovel(conjunto, imovel.id, plano)}
                favorito={ehFavorito(imovel.id)}
                onFavoritar={onFavoritar}
                onUpsell={onUpsell}
                ativo={false}
                eager={false}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
});

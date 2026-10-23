"use client";

import Link from "next/link";
import { useRef, type RefObject } from "react";
import { ROTA_PLANOS, textoConvite } from "@/components/catalogo/planos/textos";
import { RichText } from "@/components/ui/RichText";
import type { Recurso } from "@/lib/catalogo/tipos";
import { LUNETA_PRICE } from "./shared";
// o mesmo useDialog do catálogo: uma pilha só de diálogos (a janela aberta sobre o painel de filtros fecha sozinha no Esc)
import { useDialog } from "@/components/catalogo/ui/useDialog";

/**
 * "Estes recursos são da Luneta." (ou "O simulador é da Luneta.", pelo recurso). Abre no plano Lente ao tocar num recurso travado (RecursoLuneta, Favoritar, filtros e
 * ordens com cadeado), com o texto daquele recurso (src/components/catalogo/planos/textos.ts). "Assinar Luneta" só
 * troca a demonstração para a Luneta (não há pagamento); "Comparar os planos" leva à tabela da landing.
 *
 * Numa tela baixa (celular deitado, 390 px de altura) a janela nunca passa da tela: altura máxima com rolagem própria,
 * respiro menor e sem o anel (revisão final da rodada 4, UX-02).
 */
export function UpgradeModal({
  open,
  recurso = null,
  openerRef,
  onClose,
  onUpgrade,
}: {
  open: boolean;
  /** o recurso travado que abriu a janela (null: o texto padrão, com tudo o que a Luneta tem) */
  recurso?: Recurso | null;
  openerRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onUpgrade: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  useDialog({ open, dialogRef: box, onClose, initialFocusRef: primary, openerRef });
  const t = textoConvite(recurso);

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-[44] bg-noite-fixa/60 transition-opacity duration-300 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-titulo"
        aria-describedby="upgrade-texto"
        tabIndex={-1}
        inert={!open}
        className={`fixed top-1/2 left-1/2 z-[45] flex max-h-[calc(100dvh-24px)] w-[min(420px,calc(100%-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3.5 overflow-y-auto overscroll-contain rounded-3xl border-[1.5px] border-latao bg-tinta p-7 shadow-[0_30px_90px_rgba(0,0,0,.5),0_0_80px_rgba(201,162,77,.15)] outline-none baixa:gap-2.5 baixa:p-5 motion-reduce:transition-none ${
          open
            ? "visible scale-100 opacity-100 [transition:opacity_200ms_ease-out,scale_300ms_cubic-bezier(.2,.7,.2,1),visibility_0s]"
            : "invisible scale-95 opacity-0 [transition:opacity_200ms_ease-out,scale_300ms_cubic-bezier(.2,.7,.2,1),visibility_0s_300ms]"
        }`}
      >
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none" stroke="#C9A24D" strokeWidth="2.5" aria-hidden="true" className="shrink-0 baixa:hidden">
          <circle cx="28" cy="28" r="26.75" />
          <circle cx="28" cy="28" r="15.75" />
          <circle cx="28" cy="28" r="3" fill="#C9A24D" stroke="none" />
        </svg>
        <h2 id="upgrade-titulo" className="font-display text-2xl leading-[1.15] font-bold tracking-[-0.02em] baixa:text-xl">
          {t.titulo} <em className="accent text-latao-texto">Luneta</em>.
        </h2>
        <p id="upgrade-texto" className="text-sm leading-relaxed text-nevoa">
          {t.texto} <RichText text={`R$ ${LUNETA_PRICE}/mês`} />, cancele grátis em até 7 dias.
        </p>
        <button ref={primary} type="button" onClick={onUpgrade} className="btn-primary mt-1 w-full">
          Assinar Luneta
        </button>
        <Link href={ROTA_PLANOS} prefetch={false} className="btn-outline w-full">
          Comparar os planos
        </Link>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 cursor-pointer rounded-full text-[13px] font-medium text-nevoa transition-colors hover:text-luar"
        >
          Continuar na Lente
        </button>
      </div>
    </>
  );
}

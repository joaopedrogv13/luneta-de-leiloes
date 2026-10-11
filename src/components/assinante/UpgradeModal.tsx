"use client";

import { useRef, type RefObject } from "react";
import { RichText } from "@/components/ui/RichText";
import { LUNETA_PRICE } from "./shared";
import { useDialog } from "./useDialog";

/**
 * "Esse recurso é da Luneta." Abre no plano Lente ao tocar num recurso travado (Só com selo,
 * Favoritar). "Assinar Luneta" só troca a demonstração para a Luneta; não há pagamento.
 */
export function UpgradeModal({
  open,
  openerRef,
  onClose,
  onUpgrade,
}: {
  open: boolean;
  openerRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onUpgrade: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  useDialog({ open, dialogRef: box, onClose, initialFocusRef: primary, openerRef });

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
        className={`fixed top-1/2 left-1/2 z-[45] flex w-[min(420px,calc(100%-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3.5 rounded-3xl border-[1.5px] border-latao bg-tinta p-7 shadow-[0_30px_90px_rgba(0,0,0,.5),0_0_80px_rgba(201,162,77,.15)] outline-none motion-reduce:transition-none ${
          open
            ? "visible scale-100 opacity-100 [transition:opacity_200ms_ease-out,scale_300ms_cubic-bezier(.2,.7,.2,1),visibility_0s]"
            : "invisible scale-95 opacity-0 [transition:opacity_200ms_ease-out,scale_300ms_cubic-bezier(.2,.7,.2,1),visibility_0s_300ms]"
        }`}
      >
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none" stroke="#C9A24D" strokeWidth="2.5" aria-hidden="true">
          <circle cx="28" cy="28" r="26.75" />
          <circle cx="28" cy="28" r="15.75" />
          <circle cx="28" cy="28" r="3" fill="#C9A24D" stroke="none" />
        </svg>
        <h2 id="upgrade-titulo" className="font-display text-2xl leading-[1.15] font-bold tracking-[-0.02em]">
          Esse recurso é da <em className="accent text-latao-texto">Luneta</em>.
        </h2>
        <p id="upgrade-texto" className="text-sm leading-relaxed text-nevoa">
          Tags de risco, selos Promissor, Na Mira e Alvo, favoritos com alerta de praça e prioridade com o advogado.{" "}
          <RichText text={`R$ ${LUNETA_PRICE}/mês`} />, cancele quando quiser.
        </p>
        <button ref={primary} type="button" onClick={onUpgrade} className="btn-primary mt-1 w-full">
          Assinar Luneta
        </button>
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

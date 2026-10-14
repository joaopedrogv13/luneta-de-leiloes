"use client";

import { useEffect, useState } from "react";
import { LUNETA_PRICE } from "@/components/assinante/shared";
import { RichText } from "@/components/ui/RichText";
import { IconeAneis } from "../ui/icones";

/**
 * Convite do plano Lente, no topo da lista: o que fica travado e "Assinar Luneta" (na demonstração, só
 * troca a visão para a Luneta; não há pagamento).
 */
export function AvisoLente({ onAssinar }: { onAssinar: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border border-latao/45 bg-tinta px-4 py-3.5 transition-[opacity,translate] duration-300 ease-luneta starting:-translate-y-1 starting:opacity-0 motion-reduce:transition-none sm:px-5 [[data-theme=light]_&]:shadow-[0_1px_2px_rgba(15,24,48,.05),0_8px_24px_-12px_rgba(15,24,48,.14)]">
      <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-latao/80 text-latao blur-[0.6px] max-sm:hidden">
        <IconeAneis tamanho={18} />
      </span>
      <div className="min-w-[220px] flex-1">
        <p className="font-display text-[15px] leading-snug font-bold text-luar">Você está vendo como Lente: tags de risco, selos e favoritos ficam travados.</p>
        <p className="mt-0.5 text-[13px] leading-normal text-nevoa">
          Com a Luneta você vê os riscos de cada leilão, os selos Promissor, Na Mira e Alvo, e recebe alerta quando a praça muda.
        </p>
      </div>
      <button
        type="button"
        onClick={onAssinar}
        className="btn-primary !min-h-11 !px-5 !text-[13.5px] max-sm:w-full [&_[data-placeholder]]:border-noite-fixa/50 [&_[data-placeholder]]:bg-noite-fixa/10 [&_[data-placeholder]]:text-noite-fixa"
      >
        Assinar Luneta · <RichText text={`R$ ${LUNETA_PRICE}/mês`} />
      </button>
    </div>
  );
}

export interface Mensagem {
  id: number;
  texto: string;
}

/**
 * Aviso curto no pé da tela (favoritou, trocou de plano). Some sozinho em 4 s; o leitor de tela ouve o texto
 * (região "status" que existe desde o começo, para o anúncio não se perder).
 */
export function Toast({ mensagem }: { mensagem: Mensagem | null }) {
  const [saindo, setSaindo] = useState<number | null>(null);
  const [fechada, setFechada] = useState<number | null>(null);

  useEffect(() => {
    if (!mensagem) return;
    const id = mensagem.id;
    const a = window.setTimeout(() => setSaindo(id), 3800);
    const b = window.setTimeout(() => setFechada(id), 4100);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, [mensagem]);

  const visivel = mensagem && fechada !== mensagem.id ? mensagem : null;
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4 sm:bottom-5">
      {visivel && (
        <p
          key={visivel.id}
          className={`flex max-w-[460px] items-center gap-2.5 rounded-2xl border border-latao/50 bg-tinta px-4 py-3 text-[13.5px] leading-snug text-luar shadow-[0_18px_50px_rgba(0,0,0,.35)] transition-[opacity,translate] duration-300 ease-luneta starting:translate-y-3 starting:opacity-0 motion-reduce:transition-none ${
            saindo === visivel.id ? "translate-y-2 opacity-0" : ""
          }`}
        >
          <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-latao shadow-[0_0_10px_#C9A24D]" />
          {visivel.texto}
        </p>
      )}
    </div>
  );
}

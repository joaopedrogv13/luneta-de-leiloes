import Link from "next/link";
import { RECURSOS_LUNETA } from "@/lib/catalogo/planos";
import { rotaMetodoLocal } from "@/lib/catalogo/nota-texto";
import { BotaoConhecerLuneta } from "../imovel/BotaoConhecerLuneta";
import { IconeCadeado } from "../imovel/icones";
import { PreviaNotaBorrada } from "./visual";

/**
 * Plano Lente: no lugar do cartão da nota, uma chamada simples com a prévia DESENHADA (não é a nota deste imóvel: o
 * servidor nem manda a nota no Lente), o texto de RECURSOS_LUNETA e "Conhecer a Luneta". Componente pequeno de
 * propósito: a frente de planos (D) vai unificar todas as chamadas num componente só e trocar este.
 */
export function ChamadaNotaLuneta({ id }: { id: string }) {
  const r = RECURSOS_LUNETA.localizacao;
  return (
    <div className="relative overflow-hidden rounded-3xl border border-latao/35 bg-latao/[0.05] p-4 sm:p-6">
      <PreviaNotaBorrada className="max-w-[26rem]" />
      <div className="mt-5 flex items-start gap-3">
        <span aria-hidden="true" className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-latao/60 text-latao-texto">
          <IconeCadeado tamanho={16} />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="text-[15px] leading-snug font-semibold text-luar">{r.rotulo} · plano Luneta</h3>
          <p className="text-[14px] leading-relaxed text-nevoa">{r.chamada}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        <BotaoConhecerLuneta />
        <Link
          href={rotaMetodoLocal(id, "lente")}
          prefetch={false}
          className="inline-flex min-h-11 items-center text-[14px] font-semibold text-latao-texto underline-offset-4 hover:text-luar hover:underline"
        >
          Como a nota é calculada
        </Link>
      </div>
    </div>
  );
}

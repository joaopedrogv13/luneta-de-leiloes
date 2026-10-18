"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LUNETA_PRICE } from "@/components/assinante/shared";
import { RichText } from "@/components/ui/RichText";
import { FAVORITOS_ROTULO } from "@/lib/catalogo/produto";
import { ORDEM_ROTULO } from "@/lib/catalogo/rotulos";
import { ORDEM_PADRAO, type Ordem } from "@/lib/catalogo/tipos";
import { ROTA_PLANOS } from "../planos/textos";
import { IconeAneis, IconeCadeado } from "../ui/icones";

/**
 * Convite do plano Lente, no topo da lista: o que a Luneta acrescenta (a mesma lista da tabela de planos),
 * "Comparar os planos" e "Assinar Luneta" (na demonstração, só troca a visão para a Luneta; não há pagamento).
 */
export function AvisoLente({ onAssinar }: { onAssinar: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border border-latao/45 bg-tinta px-4 py-3.5 transition-[opacity,translate] duration-300 ease-luneta starting:-translate-y-1 starting:opacity-0 motion-reduce:transition-none sm:px-5 [[data-theme=light]_&]:shadow-[0_1px_2px_rgba(15,24,48,.05),0_8px_24px_-12px_rgba(15,24,48,.14)]">
      <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-latao/80 text-latao blur-[0.6px] max-sm:hidden">
        <IconeAneis tamanho={18} />
      </span>
      <div className="min-w-[220px] flex-1">
        <p className="font-display text-[15px] leading-snug font-bold text-luar">Você está vendo como Lente.</p>
        <p className="mt-0.5 text-[13px] leading-normal text-nevoa">
          Na Luneta: tags de risco e selos, filtros avançados, simulador de lance, preço da região, nota de localização e {FAVORITOS_ROTULO}.{" "}
          <Link href={ROTA_PLANOS} prefetch={false} className="font-semibold whitespace-nowrap text-latao-texto underline-offset-4 hover:text-luar hover:underline">
            Comparar os planos
          </Link>
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

/**
 * Um link da Luneta aberto no Lente (filtro avançado, de tags, de selo ou de nota na URL, ou a ordem por alertas, selo
 * ou localização): o servidor ignora o que não é do plano (planos.ts), e aqui a tela diz isso, sem quebrar. "Conhecer a
 * Luneta" abre a janela; "Tirar da busca" limpa a URL.
 */
export function AvisoForaDoPlano({
  filtros,
  ordem,
  onConhecer,
  onTirar,
}: {
  /** as pílulas dos filtros ignorados ("2+ quartos", "Área de 50 a 80 m²") */
  filtros: string[];
  /** a ordem ignorada (a lista está na padrão) */
  ordem: Ordem | null;
  onConhecer: (abridor: HTMLElement) => void;
  onTirar: () => void;
}) {
  const varios = filtros.length > 1;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border border-dashed border-latao/55 bg-latao/[0.05] px-4 py-3.5 sm:px-5">
      <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full border border-latao/60 text-latao-texto max-sm:hidden">
        <IconeCadeado tamanho={16} />
      </span>
      <div className="min-w-[220px] flex-1 text-[13.5px] leading-normal text-nevoa">
        {filtros.length > 0 && (
          <p>
            <strong className="font-semibold text-luar">{varios ? "Estes filtros são do plano Luneta" : "Este filtro é do plano Luneta"}:</strong>{" "}
            {filtros.join(", ")}. A lista abaixo mostra os imóveis sem {varios ? "esses filtros" : "esse filtro"}.
          </p>
        )}
        {ordem && (
          <p className={filtros.length ? "mt-1" : ""}>
            <strong className="font-semibold text-luar">A ordem “{ORDEM_ROTULO[ordem]}” é do plano Luneta:</strong> a lista está em “{ORDEM_ROTULO[ORDEM_PADRAO]}”.
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 max-sm:w-full">
        <button type="button" aria-haspopup="dialog" onClick={(e) => onConhecer(e.currentTarget)} className="btn-outline !min-h-11 !px-4 !text-[13.5px] max-sm:flex-1">
          Conhecer a Luneta
        </button>
        <button
          type="button"
          onClick={onTirar}
          className="inline-flex min-h-11 cursor-pointer items-center rounded-full px-3 text-[13.5px] font-semibold text-luar underline-offset-4 hover:underline max-sm:flex-1 max-sm:justify-center"
        >
          Tirar da busca
        </button>
      </div>
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

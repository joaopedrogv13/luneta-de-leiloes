"use client";

import { useId, useRef, type ReactNode } from "react";
import { numero, plural } from "@/lib/catalogo/rotulos";
import { IconeLista } from "../cartoes/icones";
import { useDialog } from "../ui/useDialog";

/**
 * Celular: o mapa em tela cheia (o botão flutuante "Ver no mapa"). Numa faixa de ~380 px no meio da lista, os
 * controles e a legenda cobriam 1/4 do mapa e as bolhas do Sudeste se sobrepunham. Aqui o mapa ocupa a tela, um
 * dedo arrasta, e tocar numa cidade abre o cartão dela embaixo (com os destaques e "Ver só esta cidade").
 * "Ver lista" (ou Esc, ou o voltar do teclado) fecha e devolve o foco ao botão que abriu. Diálogo modal: a
 * página atrás não rola.
 */
export function MapaTelaCheia({
  aberto,
  onFechar,
  cidades,
  total,
  children,
}: {
  aberto: boolean;
  onFechar: () => void;
  /** cidades com imóveis no mapa (null enquanto os pontos chegam) */
  cidades: number | null;
  total: number;
  children: ReactNode;
}) {
  const id = useId();
  const caixa = useRef<HTMLDivElement>(null);
  const fechar = useRef<HTMLButtonElement>(null);
  // Esc com o cartão de uma cidade aberto (aberto pelo toque, o foco fica em "Ver lista"): fecha só o cartão, como
  // o Esc dentro do mapa; o próximo Esc fecha o mapa
  const aoEsc = () => {
    const fecharCartao = caixa.current?.querySelector<HTMLButtonElement>("[data-cartao] button[aria-label='Fechar']");
    if (fecharCartao) fecharCartao.click();
    else onFechar();
  };
  useDialog({ open: aberto, dialogRef: caixa, onClose: aoEsc, initialFocusRef: fechar });
  if (!aberto) return null;
  return (
    <div
      ref={caixa}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${id}-titulo`}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col bg-noite outline-none transition-opacity duration-200 ease-luneta starting:opacity-0 motion-reduce:transition-none"
    >
      <div className="flex min-h-14 shrink-0 items-center gap-3 border-b border-nevoa/15 px-4 pt-[env(safe-area-inset-top)]">
        <div className="min-w-0 flex-1">
          <h2 id={`${id}-titulo`} className="font-display text-[17px] leading-tight font-bold text-luar">
            Mapa
          </h2>
          <p className="truncate text-[13px] leading-tight text-nevoa tabular-nums">
            {cidades !== null ? `${plural(cidades, "cidade", "cidades")} · ` : ""}
            {numero(total)} {total === 1 ? "imóvel" : "imóveis"}
          </p>
        </div>
        <button
          ref={fechar}
          type="button"
          onClick={onFechar}
          className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full bg-luar px-4 text-[14px] font-semibold text-noite transition-[scale] duration-150 ease-luneta active:scale-[0.96] motion-reduce:transition-none"
        >
          <IconeLista />
          Ver lista
        </button>
      </div>
      <div className="relative min-h-0 flex-1">{children}</div>
    </div>
  );
}

"use client";

import { useId, useRef, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useDialog } from "@/components/catalogo/ui/useDialog";
import { IconeFechar } from "./controles";

const nada = () => () => {};
/** true só no navegador, depois da hidratação (o portal precisa de document.body). */
function useNoNavegador() {
  return useSyncExternalStore(
    nada,
    () => true,
    () => false,
  );
}

/**
 * Pop-up modal do simulador (edição de um tipo de despesa, "Como usar"): no computador, uma janela no centro da
 * tela; no celular, uma folha que sobe de baixo. Cabeçalho com título e fechar, corpo que rola e rodapé fixo.
 * Foco preso, Esc fecha, a página atrás não rola e o foco volta para quem abriu (useDialog). Só existe
 * enquanto está aberta (quem usa monta e desmonta).
 */
export function Janela({
  titulo,
  sobretitulo,
  onFechar,
  children,
  rodape,
  largura = "md:w-[min(600px,92vw)]",
  initialFocusRef,
  openerRef,
  fallbackFocus,
}: {
  titulo: string;
  /** linha pequena acima do título ("Ajustar custo") */
  sobretitulo?: string;
  onFechar: () => void;
  children: ReactNode;
  rodape?: ReactNode;
  largura?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  openerRef?: RefObject<HTMLElement | null>;
  /** quem recebe o foco ao fechar, se quem abriu sumiu (a linha tirada da conta) */
  fallbackFocus?: () => HTMLElement | null;
}) {
  const id = useId();
  const caixa = useRef<HTMLDivElement>(null);
  const fechar = useRef<HTMLButtonElement>(null);
  const noNavegador = useNoNavegador();
  useDialog({ open: true, dialogRef: caixa, onClose: onFechar, initialFocusRef: initialFocusRef ?? fechar, openerRef, fallbackFocus });

  if (!noNavegador) return null;
  return createPortal(
    <>
      <div
        aria-hidden="true"
        onClick={onFechar}
        className="fixed inset-0 z-[70] bg-noite-fixa/60 backdrop-blur-[2px] transition-opacity duration-200 ease-luneta starting:opacity-0 motion-reduce:transition-none"
      />
      <div
        ref={caixa}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-titulo`}
        tabIndex={-1}
        className={`fixed inset-x-0 bottom-0 z-[70] flex max-h-[92dvh] flex-col overflow-clip rounded-t-3xl border border-b-0 border-nevoa/20 bg-tinta text-luar shadow-[0_-24px_80px_rgba(7,11,22,.45)] outline-none transition-[translate,opacity,scale] duration-250 ease-luneta starting:translate-y-8 starting:opacity-0 motion-reduce:transition-none md:inset-auto md:top-1/2 md:left-1/2 md:max-h-[min(86vh,820px)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl md:border-b md:shadow-[0_24px_80px_rgba(7,11,22,.45)] md:starting:translate-y-[calc(-50%+12px)] ${largura}`}
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-nevoa/15 px-5 pt-4 pb-3 md:px-6 md:pt-5 md:pb-4">
          <div className="min-w-0 flex-1">
            <span aria-hidden="true" className="mx-auto mb-3 block h-1 w-10 rounded-full bg-nevoa/35 md:hidden" />
            {sobretitulo && <p className="eyebrow mb-1.5">{sobretitulo}</p>}
            <h2 id={`${id}-titulo`} className="font-display text-[20px] leading-tight font-bold tracking-[-0.01em] md:text-[22px]">
              {titulo}
            </h2>
          </div>
          <button
            ref={fechar}
            type="button"
            aria-label="Fechar"
            onClick={onFechar}
            className="-mr-2 inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-nevoa transition-colors hover:bg-nevoa/12 hover:text-luar pointer-fine:size-9"
          >
            <IconeFechar />
          </button>
        </div>
        <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 md:px-6 md:py-5">{children}</div>
        {rodape && <div className="shrink-0 border-t border-nevoa/15 bg-tinta px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] md:px-6 md:pb-4">{rodape}</div>}
      </div>
    </>,
    document.body,
  );
}

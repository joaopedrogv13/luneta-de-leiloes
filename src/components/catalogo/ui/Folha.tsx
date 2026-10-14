"use client";

import { useEffect, useId, useRef, useSyncExternalStore, type PointerEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { BOTAO_ICONE } from "./estilos";
import { voltarEntradaPropria } from "./historico";
import { IconeX } from "./icones";
import { semMovimento } from "./useAdiado";
import { useDialog } from "./useDialog";

const nada = () => () => {};
/** true só no navegador, depois da hidratação (o portal precisa de document.body). */
function useNoNavegador() {
  return useSyncExternalStore(
    nada,
    () => true,
    () => false,
  );
}

/** Quanto arrastar a folha para baixo (px) para ela fechar no celular. */
const ARRASTE_FECHA = 110;

/**
 * Folha: painel modal que entra pela direita no computador (~480px, altura toda) e sobe de baixo, em
 * tela cheia, no celular (puxar pela alça para baixo fecha). Cabeçalho com título e fechar, corpo que
 * rola e rodapé fixo. Foco preso, Esc fecha, a página atrás não rola (useDialog); o foco volta para
 * quem abriu. Fica montada e inerte quando fechada, para a animação de saída e para não perder o
 * estado de rolagem.
 *
 * Vai para o fim do <body> (portal): um cabeçalho fixo com `backdrop-filter` ou `transform` em volta da
 * barra prenderia o `position: fixed` dentro dele. Camada: z-40 (o modal de upgrade, que pode abrir por
 * cima dela, precisa de z maior).
 *
 * `historico`: abrir cria uma entrada no histórico (mesma URL), e o "voltar" do navegador (o botão do
 * Android) fecha a folha, como num app, em vez de sair da página. Fechando por dentro, a entrada sai.
 */
export function Folha({
  aberto,
  onFechar,
  titulo,
  subtitulo,
  children,
  rodape,
  abaixoDoCabecalho,
  openerRef,
  initialFocusRef,
  corpoRef,
  rotuloFechar = "Fechar",
  historico = false,
  lateral,
}: {
  aberto: boolean;
  onFechar: () => void;
  titulo: string;
  /** linha menor ao lado do título ("3 filtros ativos") */
  subtitulo?: ReactNode;
  children: ReactNode;
  rodape?: ReactNode;
  /** faixa fixa logo abaixo do cabeçalho (navegação por seção) */
  abaixoDoCabecalho?: ReactNode;
  openerRef?: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** o elemento que rola (para navegação por seção) */
  corpoRef?: RefObject<HTMLDivElement | null>;
  rotuloFechar?: string;
  /** o "voltar" do navegador fecha a folha */
  historico?: boolean;
  /**
   * coluna à esquerda do corpo a partir de md (navegação por seção sempre à vista): a folha fica mais larga
   * (até 720 px) no computador
   */
  lateral?: ReactNode;
}) {
  const id = useId();
  const caixa = useRef<HTMLDivElement>(null);
  const fechar = useRef<HTMLButtonElement>(null);
  const arraste = useRef<{ y0: number; t0: number; dy: number } | null>(null);
  const noNavegador = useNoNavegador();
  useDialog({ open: aberto, dialogRef: caixa, onClose: onFechar, initialFocusRef: initialFocusRef ?? fechar, openerRef });

  // ---- histórico: o "voltar" fecha a folha ----
  const ultimoFechar = useRef(onFechar);
  useEffect(() => {
    ultimoFechar.current = onFechar;
  });
  useEffect(() => {
    if (!aberto || !historico) return;
    let peloVoltar = false;
    const estado = window.history.state as Record<string, unknown> | null;
    window.history.pushState({ ...(estado ?? {}), lunetaFolha: id }, "");
    const aoVoltar = () => {
      if ((window.history.state as { lunetaFolha?: string } | null)?.lunetaFolha === id) return;
      peloVoltar = true;
      ultimoFechar.current();
    };
    window.addEventListener("popstate", aoVoltar);
    return () => {
      window.removeEventListener("popstate", aoVoltar);
      // fechou por dentro (×, Esc, "Mostrar"): a entrada da folha sai
      if (!peloVoltar && (window.history.state as { lunetaFolha?: string } | null)?.lunetaFolha === id) voltarEntradaPropria();
    };
  }, [aberto, historico, id]);

  // ---- puxar para baixo (celular) ----
  const naAlcaDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" || !caixa.current || (e.target as HTMLElement).closest("button")) return;
    arraste.current = { y0: e.clientY, t0: performance.now(), dy: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
    caixa.current.style.transition = "none";
  };
  const naAlcaMove = (e: PointerEvent<HTMLDivElement>) => {
    const a = arraste.current;
    if (!a || !caixa.current) return;
    a.dy = Math.max(0, e.clientY - a.y0);
    caixa.current.style.translate = `0 ${a.dy}px`;
  };
  const naAlcaUp = () => {
    const a = arraste.current;
    arraste.current = null;
    const el = caixa.current;
    if (!a || !el) return;
    el.style.transition = "";
    el.style.translate = "";
    const rapido = a.dy > 40 && a.dy / Math.max(1, performance.now() - a.t0) > 0.6;
    if (a.dy > ARRASTE_FECHA || rapido) onFechar();
  };

  if (!noNavegador) return null;
  return createPortal(
    <>
      <div
        aria-hidden="true"
        onClick={onFechar}
        className={`fixed inset-0 z-40 bg-noite-fixa/55 backdrop-blur-[2px] transition-opacity duration-250 ease-luneta motion-reduce:transition-none ${
          aberto ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <div
        ref={caixa}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-titulo`}
        tabIndex={-1}
        inert={!aberto}
        className={`fixed inset-x-0 top-2 bottom-0 z-40 flex flex-col overflow-clip rounded-t-3xl border border-b-0 border-nevoa/20 bg-tinta text-luar shadow-[0_-24px_80px_rgba(7,11,22,.45)] outline-none md:inset-y-0 md:top-0 md:right-0 md:left-auto ${lateral ? "md:w-[min(720px,100vw)]" : "md:w-[480px]"} md:rounded-l-3xl md:rounded-tr-none md:border-r-0 md:border-b md:shadow-[-24px_0_80px_rgba(7,11,22,.35)] motion-reduce:transition-none ${
          aberto
            ? "visible translate-y-0 [transition:translate_300ms_var(--ease-luneta),visibility_0s] md:translate-x-0"
            : "invisible translate-y-full [transition:translate_250ms_var(--ease-luneta),visibility_0s_250ms] md:translate-x-full md:translate-y-0"
        }`}
      >
        <div className="relative shrink-0 border-b border-nevoa/15">
          {/* alça: só no celular */}
          <div
            aria-hidden="true"
            onPointerDown={naAlcaDown}
            onPointerMove={naAlcaMove}
            onPointerUp={naAlcaUp}
            onPointerCancel={naAlcaUp}
            className="absolute inset-x-0 top-0 flex h-6 touch-none justify-center pt-2 md:hidden"
          >
            <span className="h-1 w-10 rounded-full bg-nevoa/40" />
          </div>
          <div
            onPointerDown={naAlcaDown}
            onPointerMove={naAlcaMove}
            onPointerUp={naAlcaUp}
            onPointerCancel={naAlcaUp}
            className="flex touch-none items-center gap-3 px-5 pt-5 pb-3 md:touch-auto md:px-6 md:pt-5 md:pb-4"
          >
            <div className="flex min-w-0 flex-1 items-baseline gap-2.5">
              <h2 id={`${id}-titulo`} className="font-display text-xl leading-tight font-bold tracking-[-0.01em]">
                {titulo}
              </h2>
              {subtitulo && <span className="truncate text-[13px] text-nevoa tabular-nums">{subtitulo}</span>}
            </div>
            <button ref={fechar} type="button" aria-label={rotuloFechar} onClick={onFechar} className={`${BOTAO_ICONE} -mr-2`}>
              <IconeX tamanho={16} />
            </button>
          </div>
          {abaixoDoCabecalho}
        </div>
        {/* relative: o que é absoluto lá dentro (textos só para leitor de tela) fica preso à área que rola,
            senão "vaza" para a folha e a faz rolar inteira (cabeçalho some) */}
        <div className="flex min-h-0 flex-1">
          {lateral && <div className="hidden w-[184px] shrink-0 overflow-y-auto border-r border-nevoa/15 md:block">{lateral}</div>}
          <div ref={corpoRef} className="relative min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
            {children}
          </div>
        </div>
        {rodape && (
          <div className="shrink-0 border-t border-nevoa/15 bg-tinta px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] md:px-6 md:pb-4">{rodape}</div>
        )}
      </div>
    </>,
    document.body,
  );
}

/** Rola um elemento até o topo da área que rola, respeitando "reduzir movimento". */
export function rolarPara(el: HTMLElement | null) {
  el?.scrollIntoView({ block: "start", behavior: semMovimento() ? "auto" : "smooth" });
}

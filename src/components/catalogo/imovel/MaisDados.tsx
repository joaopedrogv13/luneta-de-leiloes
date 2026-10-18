"use client";

import { useId, useRef, useState, type ReactNode } from "react";

/** Até onde o conteúdo começa fechado: lg (celular e tablet) ou md (só no celular). */
const CLASSES = {
  lg: { botao: "lg:hidden", fechado: "max-lg:hidden", aberto: "max-lg:mt-6" },
  md: { botao: "md:hidden", fechado: "max-md:hidden", aberto: "max-md:mt-4" },
} as const;

/**
 * Celular e tablet (até lg; com `ate="md"`, só no celular): o conteúdo fica fechado atrás de "Ver todos os dados
 * (N)" e abre logo abaixo; nas telas maiores, sempre aberto (o botão não aparece). Fechado, o conteúdo some do layout (display: none), então
 * também sai do Tab e do leitor de tela; o HTML já vem do servidor, então abrir é instantâneo e no computador
 * nada muda depois de hidratar. "Mostrar menos", no fim, fecha e devolve a pessoa ao botão.
 */
export function MaisDados({
  rotulo,
  rotuloAberto,
  ate = "lg",
  className = "",
  children,
}: {
  rotulo: ReactNode;
  rotuloAberto: ReactNode;
  ate?: keyof typeof CLASSES;
  /** classes do botão */
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  const c = CLASSES[ate];
  const [aberto, setAberto] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);
  const fechar = () => {
    setAberto(false);
    requestAnimationFrame(() => {
      botao.current?.focus({ preventScroll: true });
      botao.current?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    });
  };
  return (
    <>
      <button
        ref={botao}
        type="button"
        aria-expanded={aberto}
        aria-controls={id}
        onClick={() => setAberto((v) => !v)}
        className={`group/mais mt-3 inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-nevoa/25 px-4 text-[15px] font-semibold text-luar transition-colors duration-150 hover:border-latao hover:bg-latao/[0.06] ${c.botao} ${className}`}
      >
        {aberto ? rotuloAberto : rotulo}
        <svg
          viewBox="0 0 20 20"
          width="16"
          height="16"
          aria-hidden="true"
          className={`shrink-0 text-latao-texto transition-transform duration-200 ease-luneta motion-reduce:transition-none ${aberto ? "rotate-180" : ""}`}
        >
          <path d="M5 7.5 10 12.5 15 7.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div id={id} className={aberto ? c.aberto : c.fechado}>
        {children}
        {aberto && (
          <button
            type="button"
            onClick={fechar}
            className={`mt-5 inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full px-1 text-[14px] font-semibold text-latao-texto underline-offset-4 hover:underline ${c.botao}`}
          >
            Mostrar menos
            <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" className="rotate-180">
              <path d="M5 7.5 10 12.5 15 7.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>
    </>
  );
}

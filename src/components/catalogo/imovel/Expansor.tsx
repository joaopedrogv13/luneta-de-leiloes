"use client";

import { useId, useState, type ReactNode } from "react";

/**
 * "Ver detalhes" que abre logo abaixo, com a altura animada (grade 0fr → 1fr) e parada com "reduzir movimento".
 * Fechado, o conteúdo fica inerte (fora do Tab e do leitor de tela), mas já vem do servidor: abrir é instantâneo.
 */
export function Expansor({
  rotulo,
  rotuloAberto,
  children,
  className = "",
  classeBotao = "",
  inicialAberto = false,
}: {
  rotulo: ReactNode;
  /** texto do botão com o conteúdo aberto (padrão: o mesmo) */
  rotuloAberto?: ReactNode;
  children: ReactNode;
  className?: string;
  classeBotao?: string;
  inicialAberto?: boolean;
}) {
  const [aberto, setAberto] = useState(inicialAberto);
  // aberto e já parado: o conteúdo deixa de ser recortado (anel de foco, sombras e pop-ups aparecem inteiros)
  const [solto, setSolto] = useState(inicialAberto);
  const id = useId();
  const alternar = () => {
    const abrir = !aberto;
    // sem animação (reduzir movimento), não há fim de transição para esperar
    setSolto(abrir && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    setAberto(abrir);
  };
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls={id}
        onClick={alternar}
        className={`group/exp inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full text-[14px] font-medium text-latao-texto transition-colors hover:text-luar pointer-fine:min-h-9 ${classeBotao}`}
      >
        <span>{aberto ? (rotuloAberto ?? rotulo) : rotulo}</span>
        <svg
          viewBox="0 0 20 20"
          width="16"
          height="16"
          aria-hidden="true"
          className={`shrink-0 transition-transform duration-200 ease-luneta motion-reduce:transition-none ${aberto ? "rotate-180" : ""}`}
        >
          <path d="M5 7.5 10 12.5 15 7.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div
        id={id}
        inert={!aberto}
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget && e.propertyName === "grid-template-rows" && aberto) setSolto(true);
        }}
        className={`grid transition-[grid-template-rows,opacity] duration-250 ease-luneta motion-reduce:transition-none ${aberto ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
      >
        <div className={`min-h-0 ${aberto && solto ? "" : "overflow-hidden"}`}>{children}</div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

export interface SecaoNav {
  id: string;
  rotulo: string;
}

/** Linha de leitura (px do topo da janela): a seção que passou dela é a atual. Cabeçalho + esta barra + folga. */
const LINHA = 150;

/**
 * Navegação interna fixa (Resumo · Riscos · Simulador · Região · Localização · Documentos): âncoras comuns
 * (funcionam sem JS) com a seção atual marcada (aria-current) enquanto a página rola. No celular, a fila
 * rola de lado e a seção atual fica sempre à vista.
 */
export function NavSecoes({ secoes }: { secoes: SecaoNav[] }) {
  const [atual, setAtual] = useState<string>(secoes[0]?.id ?? "");
  const lista = useRef<HTMLUListElement>(null);

  useEffect(() => {
    let quadro = 0;
    const medir = () => {
      quadro = 0;
      let achada = secoes[0]?.id ?? "";
      for (const s of secoes) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= LINHA) achada = s.id;
      }
      // no fim da página, a última seção (curta) também conta
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) achada = secoes[secoes.length - 1]?.id ?? achada;
      setAtual(achada);
    };
    const agendar = () => {
      if (!quadro) quadro = requestAnimationFrame(medir);
    };
    medir();
    window.addEventListener("scroll", agendar, { passive: true });
    window.addEventListener("resize", agendar);
    return () => {
      cancelAnimationFrame(quadro);
      window.removeEventListener("scroll", agendar);
      window.removeEventListener("resize", agendar);
    };
  }, [secoes]);

  // a seção atual sempre à vista na fila (celular), sem mexer na rolagem da página
  useEffect(() => {
    const ul = lista.current;
    const item = ul?.querySelector<HTMLElement>(`[data-secao="${atual}"]`);
    if (!ul || !item || ul.scrollWidth <= ul.clientWidth) return;
    const alvo = item.offsetLeft - (ul.clientWidth - item.offsetWidth) / 2;
    ul.scrollTo({ left: Math.max(0, alvo), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [atual]);

  return (
    <nav aria-label="Seções da página" className="relative">
      <ul ref={lista} className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
        {secoes.map((s) => {
          const ativa = s.id === atual;
          return (
            <li key={s.id} data-secao={s.id} className="shrink-0">
              <a
                href={`#${s.id}`}
                aria-current={ativa ? "location" : undefined}
                className={`relative inline-flex min-h-11 items-center rounded-full px-3.5 text-[13.5px] font-medium whitespace-nowrap no-underline transition-colors duration-150 pointer-fine:min-h-9 ${
                  ativa ? "bg-latao/15 text-luar ring-1 ring-latao/55" : "text-nevoa hover:bg-nevoa/[0.08] hover:text-luar"
                }`}
              >
                {s.rotulo}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

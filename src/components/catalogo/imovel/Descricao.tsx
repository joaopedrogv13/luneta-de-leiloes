"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { NOTA_LGPD, temMascara, TextoMascarado } from "@/components/catalogo/tags/TextoMascarado";

/** Altura da descrição fechada (~7 linhas de 15px × 1,65). */
const FECHADA = 172;

/**
 * Antes de medir (HTML do servidor e hidratação): um texto que passa das ~7 linhas em qualquer largura já vem
 * fechado, para a página não encolher de repente quando o JS chega. A medida de verdade vem logo depois.
 */
const pareceLonga = (t: string) => t.length > 600 || t.split("\n").length > 7;

/**
 * Descrição completa do anúncio, como a fonte publicou (quebras de linha mantidas), com "Ler mais" quando
 * passa de umas 7 linhas. Fechada, o texto continua inteiro no DOM (leitores de tela leem tudo); só a
 * parte visível é cortada, com um esmaecido no fim.
 */
export function Descricao({ texto }: { texto: string }) {
  const id = useId();
  const caixa = useRef<HTMLDivElement>(null);
  const [longa, setLonga] = useState(() => pareceLonga(texto));
  const [aberta, setAberta] = useState(false);

  useLayoutEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const medir = () => setLonga(el.scrollHeight > FECHADA + 24);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, [texto]);

  const cortada = longa && !aberta;
  return (
    <div>
      <div
        id={id}
        ref={caixa}
        style={cortada ? { maxHeight: FECHADA } : undefined}
        className={`relative overflow-hidden text-[15px] leading-[1.65] break-words whitespace-pre-line text-luar/90 ${
          cortada ? "[mask-image:linear-gradient(180deg,#000_62%,transparent)]" : ""
        }`}
      >
        <TextoMascarado texto={texto} />
      </div>
      {longa && (
        <button
          type="button"
          aria-expanded={aberta}
          aria-controls={id}
          onClick={() => setAberta((v) => !v)}
          className="mt-2 inline-flex min-h-11 cursor-pointer items-center rounded-lg px-1 text-sm font-semibold text-latao-texto underline-offset-4 hover:underline pointer-fine:min-h-8"
        >
          {aberta ? "Ler menos" : "Ler mais"}
          <span className="sr-only"> da descrição</span>
        </button>
      )}
      {temMascara(texto) && <p className="mt-2 max-w-[68ch] text-[12.5px] leading-relaxed text-nevoa">{NOTA_LGPD}</p>}
    </div>
  );
}

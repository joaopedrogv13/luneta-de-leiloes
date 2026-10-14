"use client";

import type { ReactNode } from "react";
import { numero } from "@/lib/catalogo/rotulos";
import { CHIP, CHIP_NEUTRO_ON, CHIP_OFF, CHIP_ON } from "./estilos";
import { IconeCheck } from "./icones";

export interface OpcaoChip {
  valor: string;
  rotulo: string;
  /** quantos imóveis a opção daria; sem número, não mostra contagem */
  total?: number;
  /** ícone antes do rótulo (gravidade da tag, por exemplo) */
  icone?: ReactNode;
  /** texto só para leitores de tela, antes do rótulo ("Risco grave: ") */
  prefixoSr?: string;
  /** frase sob o rótulo no title (dica ao passar o mouse) */
  dica?: string;
  /** opção "sem filtro" ("Qualquer"): escolhida, fica marcada sem o latão de filtro ativo */
  neutro?: boolean;
}

/**
 * Escolha por chips, múltipla (padrão) ou única. Cada chip é um botão com `aria-pressed`, ✓ quando
 * escolhido (não só a cor) e a contagem ao lado. Opções com 0 imóveis somem, menos as escolhidas.
 */
export function Chips({
  rotulo,
  opcoes,
  valor,
  onChange,
  multiplo = true,
  permitirVazio = true,
  ocultarZerados = true,
  desabilitado = false,
  vazio = "Nenhuma opção nesta busca.",
  className = "",
}: {
  /** nome do grupo para leitores de tela */
  rotulo: string;
  opcoes: readonly OpcaoChip[];
  valor: readonly string[];
  onChange: (valor: string[]) => void;
  multiplo?: boolean;
  /** na escolha única: tocar no escolhido desmarca */
  permitirVazio?: boolean;
  ocultarZerados?: boolean;
  desabilitado?: boolean;
  vazio?: string;
  className?: string;
}) {
  const escolhidos = new Set(valor);
  const visiveis = ocultarZerados ? opcoes.filter((o) => o.total === undefined || o.total > 0 || escolhidos.has(o.valor)) : opcoes;

  const alternar = (v: string) => {
    if (multiplo) {
      onChange(escolhidos.has(v) ? valor.filter((x) => x !== v) : [...valor, v]);
    } else if (escolhidos.has(v)) {
      if (permitirVazio) onChange([]);
    } else {
      onChange([v]);
    }
  };

  if (!visiveis.length) return <p className="text-[13px] text-nevoa">{vazio}</p>;

  return (
    <div role="group" aria-label={rotulo} className={`flex flex-wrap gap-2 ${className}`}>
      {visiveis.map((o) => {
        const on = escolhidos.has(o.valor);
        return (
          <button
            key={o.valor}
            type="button"
            aria-pressed={on}
            disabled={desabilitado}
            title={o.dica}
            onClick={() => alternar(o.valor)}
            className={`${CHIP} ${on ? (o.neutro ? CHIP_NEUTRO_ON : CHIP_ON) : CHIP_OFF}`}
          >
            <span
              aria-hidden="true"
              className={`inline-flex overflow-hidden ${o.neutro ? "text-luar" : "text-latao-texto"} transition-[width,margin,opacity] duration-150 ease-luneta motion-reduce:transition-none ${on ? "-ml-1 w-3 opacity-100" : "-mr-2 w-0 opacity-0"}`}
            >
              <IconeCheck />
            </span>
            {o.icone}
            <span>
              {o.prefixoSr && <span className="sr-only">{o.prefixoSr}</span>}
              {o.rotulo}
            </span>
            {o.total !== undefined && (
              <span className={`text-xs tabular-nums ${on ? "text-latao-texto" : "text-nevoa"}`}>
                <span className="sr-only">, </span>
                {numero(o.total)}
                <span className="sr-only"> imóveis</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

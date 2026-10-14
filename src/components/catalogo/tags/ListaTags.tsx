"use client";

import { useState } from "react";
import type { Plano, TagDetalhe, TagResumo } from "@/lib/catalogo/tipos";
import { ordenarTags } from "./conteudo";
import { TagClicavel, TagsBloqueadas, TAMANHO_TAG, type TamanhoTag } from "./TagClicavel";

/**
 * Tags de um imóvel em ordem de leitura (confirmadas antes das em revisão; grave, atenção, positivo,
 * informativo), cada uma clicável. Com `limite`, mostra as primeiras e um "+N" que abre o resto ali mesmo
 * (e "Mostrar menos" fecha). No plano Lente, o lugar das tags vira o convite à Luneta.
 */
export function ListaTags({
  tags,
  plano = "luneta",
  limite,
  onUpsell,
  hrefEvidencia,
  tamanho = "sm",
  rotulo = "Tags de risco",
  className = "",
}: {
  tags: readonly (TagResumo | TagDetalhe)[];
  plano?: Plano;
  /** quantas mostrar antes do "+N"; sem limite, todas */
  limite?: number;
  /** obrigatório no Lente: abre o modal de upgrade */
  onUpsell?: (opener: HTMLElement) => void;
  /** cartões: link "ver por que" no pop-up (a evidência fica na página do imóvel) */
  hrefEvidencia?: string;
  tamanho?: TamanhoTag;
  /** nome da lista para leitores de tela */
  rotulo?: string;
  className?: string;
}) {
  const [aberta, setAberta] = useState(false);

  if (plano === "lente") {
    return onUpsell ? <TagsBloqueadas onUpsell={onUpsell} tamanho={tamanho} className={className} /> : null;
  }

  if (tags.length === 0) {
    return <p className={`text-xs leading-snug text-nevoa ${className}`}>Nenhuma tag de risco nos dados da fonte; confira o edital.</p>;
  }

  const ordenadas = ordenarTags(tags);
  const corte = limite && limite > 0 && ordenadas.length > limite ? limite : ordenadas.length;
  const visiveis = aberta ? ordenadas : ordenadas.slice(0, corte);
  const escondidas = ordenadas.length - corte;
  const primeiraRevisao = visiveis.findIndex((t) => t.emRevisao);
  // o rótulo "Em revisão" só aparece quando há confirmadas antes (lista inteira ou aberta), para não roubar lugar no cartão
  const comRotuloRevisao = primeiraRevisao > 0 && (aberta || !limite);

  return (
    <ul aria-label={rotulo} className={`flex flex-wrap items-center gap-x-1.5 gap-y-2 ${className}`}>
      {visiveis.map((t, i) => (
        <li key={`${t.slug}-${t.emRevisao ? "r" : "c"}`} className="flex max-w-full items-center gap-1.5">
          {comRotuloRevisao && i === primeiraRevisao && (
            <span aria-hidden="true" className="ml-1 text-[11px] leading-none font-medium whitespace-nowrap text-nevoa">
              Em revisão:
            </span>
          )}
          <TagClicavel tag={t} tamanho={tamanho} hrefEvidencia={hrefEvidencia} />
        </li>
      ))}
      {escondidas > 0 && (
        <li>
          <button
            type="button"
            aria-expanded={aberta}
            onClick={() => setAberta((v) => !v)}
            className={`relative z-10 inline-flex cursor-pointer items-center rounded-full border border-nevoa/30 leading-none font-semibold whitespace-nowrap text-nevoa tabular-nums transition-colors duration-150 before:absolute before:inset-x-0 before:-inset-y-1 before:content-[''] hover:border-nevoa/70 hover:text-luar pointer-coarse:before:-inset-y-2 ${TAMANHO_TAG[tamanho]}`}
          >
            {/* o nome acessível começa pelo texto visível ("+2", "Mostrar menos"): quem usa comando de voz fala o que vê */}
            {aberta ? (
              <>
                Mostrar menos<span className="sr-only"> tags</span>
              </>
            ) : (
              <>
                +{escondidas}
                <span className="sr-only"> {escondidas === 1 ? "tag" : "tags"}: mostrar todas</span>
              </>
            )}
          </button>
        </li>
      )}
    </ul>
  );
}

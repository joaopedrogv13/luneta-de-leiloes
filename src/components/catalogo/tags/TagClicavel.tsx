"use client";

import { useEffect, useRef, type MouseEvent } from "react";
import { SeverityIcon } from "@/components/niveis/severity";
import { Popover } from "@/components/catalogo/ui/Popover";
import { SEVERIDADE_ROTULO } from "@/lib/catalogo/rotulos";
import type { Severidade, TagDetalhe, TagResumo } from "@/lib/catalogo/tipos";
import { IconeCadeado } from "../cartoes/icones";
import { InfoTag } from "./InfoTag";

export type TamanhoTag = "sm" | "md";

/** Cores da Tag (src/components/ui/Tag.tsx), com estados de hover e de aberto. */
const ESTILO: Record<Severidade, { base: string; hover: string; aberto: string }> = {
  grave: { base: "border-grave/55 bg-grave/12 text-grave-texto", hover: "hover:border-grave/85 hover:bg-grave/20", aberto: "border-grave bg-grave/22 ring-grave/25" },
  atencao: { base: "border-aten/50 bg-aten/10 text-aten", hover: "hover:border-aten/85 hover:bg-aten/18", aberto: "border-aten bg-aten/20 ring-aten/25" },
  positivo: { base: "border-pos/50 bg-pos/10 text-pos", hover: "hover:border-pos/85 hover:bg-pos/18", aberto: "border-pos bg-pos/20 ring-pos/25" },
  info: { base: "border-nevoa/50 bg-nevoa/10 text-nevoa", hover: "hover:border-nevoa/85 hover:bg-nevoa/18 hover:text-luar", aberto: "border-nevoa bg-nevoa/20 text-luar ring-nevoa/25" },
};

/** Em revisão: neutra e tracejada, sem a cor da gravidade (nunca parece fato). */
const REVISAO = {
  base: "border-dashed border-nevoa/65 bg-transparent text-nevoa",
  hover: "hover:border-nevoa hover:text-luar",
  aberto: "border-nevoa text-luar ring-nevoa/25",
};

export const TAMANHO_TAG: Record<TamanhoTag, string> = {
  sm: "gap-1.5 px-2.5 py-1.5 text-xs",
  md: "gap-2 px-3 py-2 text-[13px]",
};

/** Base da pílula: igual à Tag; o ::before amplia a área de toque sem mudar o desenho. */
const PILULA =
  "relative z-10 inline-flex max-w-full cursor-pointer items-center rounded-full border leading-none font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow] duration-150 ease-luneta select-none before:absolute before:inset-x-0 before:-inset-y-1 before:content-[''] pointer-coarse:before:-inset-y-2 motion-reduce:transition-none";

/** Ícone das tags em revisão: anel tracejado. */
function IconeRevisao({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="shrink-0">
      <circle cx="6" cy="6" r="4.4" strokeDasharray="2.1 1.7" />
    </svg>
  );
}

/** Desenho da pílula (sem comportamento): ícone + texto, com a gravidade também em texto oculto. */
export function PilulaTag({ tag, tamanho = "sm" }: { tag: TagResumo; tamanho?: TamanhoTag }) {
  return (
    <>
      {tag.emRevisao ? <IconeRevisao size={tamanho === "md" ? 13 : 12} /> : <SeverityIcon severity={tag.severidade} size={tamanho === "md" ? 13 : 12} />}
      <span className="sr-only">{tag.emRevisao ? "Em revisão" : SEVERIDADE_ROTULO[tag.severidade]}: </span>
      <span className="truncate">{tag.rotulo}</span>
    </>
  );
}

/**
 * Tag de risco clicável: a pílula (cor por gravidade, ícone e texto) é um botão que abre o pop-up com a
 * explicação (InfoTag). Com a TagDetalhe, o pop-up mostra também a evidência, a origem e a confiança.
 * Fica por cima do link do cartão (z-10): clicar na tag não navega.
 */
export function TagClicavel({
  tag,
  tamanho = "sm",
  hrefEvidencia,
  posicao = "bottom-start",
}: {
  tag: TagResumo | TagDetalhe;
  tamanho?: TamanhoTag;
  /** link "ver por que" quando a tag vem sem evidência (cartões → página do imóvel) */
  hrefEvidencia?: string;
  posicao?: "bottom-start" | "bottom" | "top-start";
}) {
  const e = tag.emRevisao ? REVISAO : (ESTILO[tag.severidade] ?? ESTILO.info);
  const estado = tag.emRevisao ? "em revisão" : SEVERIDADE_ROTULO[tag.severidade];
  return (
    <Popover
      papel="note"
      rotulo={`Explicação da tag ${tag.rotulo}`}
      posicao={posicao}
      largura="min(23rem, calc(100vw - 24px))"
      gatilho={{
        ariaLabel: `${tag.rotulo} (${estado}): ver explicação`,
        conteudo: <PilulaTag tag={tag} tamanho={tamanho} />,
        className: (aberto) => `${PILULA} ${TAMANHO_TAG[tamanho]} ${e.base} ${aberto ? `ring-[3px] ${e.aberto}` : e.hover}`,
      }}
    >
      {({ fechar }) => <PainelTag tag={tag} fechar={fechar} hrefEvidencia={hrefEvidencia} />}
    </Popover>
  );
}

/** O botão-gatilho do pop-up que contém `el` (o Popover liga os dois por aria-controls enquanto está aberto). */
function gatilhoDe(el: HTMLElement | null) {
  const painel = el?.closest<HTMLElement>("[role=note]");
  return painel?.id ? document.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(painel.id)}"]`) : null;
}

/**
 * Conteúdo do pop-up com o comportamento de foco que falta ao Popover genérico:
 * - "Fechar" devolve o foco à tag (sem isso o foco caía no <body> e o teclado voltava ao topo da página);
 * - o foco saindo do pop-up pelo Tab o fecha (senão ele ficava aberto, cobrindo o cartão seguinte que
 *   recebe o foco: WCAG 2.4.11).
 */
function PainelTag({ tag, fechar, hrefEvidencia }: { tag: TagResumo | TagDetalhe; fechar: () => void; hrefEvidencia?: string }) {
  const raiz = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const painel = raiz.current?.closest<HTMLElement>("[role=note]");
    if (!painel) return;
    const sair = (e: FocusEvent) => {
      const para = e.relatedTarget;
      // sem destino (troca de janela, clique em área sem foco): quem decide é o clique fora do Popover
      if (!(para instanceof Node) || painel.contains(para) || gatilhoDe(painel)?.contains(para)) return;
      fechar();
    };
    painel.addEventListener("focusout", sair);
    return () => painel.removeEventListener("focusout", sair);
  }, [fechar]);
  return (
    <div ref={raiz}>
      <InfoTag
        tag={tag}
        hrefEvidencia={hrefEvidencia}
        onFechar={() => {
          gatilhoDe(raiz.current)?.focus({ preventScroll: true });
          fechar();
        }}
      />
    </div>
  );
}

/** Larguras dos marcadores do Lente: as mesmas em todo cartão (não entregam quantas tags há, nem quais). */
const LARGURAS_BLOQUEADAS = ["w-[74px]", "w-[104px]", "w-[62px]", "w-[88px]", "w-[70px]"] as const;

/**
 * Plano Lente: uma pílula neutra e desfocada, sem rótulo real (o conteúdo nem chega ao navegador),
 * que abre o convite à Luneta.
 */
export function TagBloqueada({
  onUpsell,
  tamanho = "sm",
  largura = "w-[84px]",
}: {
  onUpsell: (opener: HTMLElement) => void;
  tamanho?: TamanhoTag;
  /** classe de largura do marcador */
  largura?: string;
}) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label="Tag de risco: recurso do plano Luneta"
      onClick={(ev: MouseEvent<HTMLButtonElement>) => onUpsell(ev.currentTarget)}
      className={`relative z-10 inline-flex cursor-pointer items-center rounded-full ${tamanho === "md" ? "h-[33px]" : "h-[26px]"} ${largura}`}
    >
      <span aria-hidden="true" className="absolute inset-0 rounded-full border border-nevoa/45 bg-nevoa/12 blur-[2.5px]" />
    </button>
  );
}

/**
 * Plano Lente: o lugar das tags num botão só (um alvo no teclado, não três): marcadores neutros
 * desfocados e o rótulo "Tags de risco · Luneta" com cadeado. Abre o convite à Luneta.
 */
export function TagsBloqueadas({
  onUpsell,
  tamanho = "sm",
  className = "",
}: {
  onUpsell: (opener: HTMLElement) => void;
  tamanho?: TamanhoTag;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={(ev: MouseEvent<HTMLButtonElement>) => onUpsell(ev.currentTarget)}
      className={`group/bloq relative z-10 flex w-full max-w-[26rem] cursor-pointer items-center overflow-hidden rounded-full py-1 text-left ${className}`}
    >
      <span aria-hidden="true" className="flex gap-1.5 blur-[3px] transition-[filter] duration-200 group-hover/bloq:blur-[4px] motion-reduce:transition-none">
        {LARGURAS_BLOQUEADAS.map((w) => (
          <span key={w} className={`block shrink-0 rounded-full border border-nevoa/45 bg-nevoa/12 ${tamanho === "md" ? "h-[33px]" : "h-[26px]"} ${w}`} />
        ))}
      </span>
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-latao/40 bg-tinta/90 px-2.5 py-1.5 text-[11px] leading-none font-semibold tracking-[0.06em] text-latao-texto uppercase shadow-sm transition-colors group-hover/bloq:border-latao">
          <IconeCadeado size={12} />
          <span aria-hidden="true">Tags de risco · Luneta</span>
          <span className="sr-only">Tags de risco: recurso do plano Luneta. Conhecer o plano</span>
        </span>
      </span>
    </button>
  );
}

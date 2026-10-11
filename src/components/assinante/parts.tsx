"use client";

import Image from "next/image";
import { useRef, type MouseEvent } from "react";
import type { Listing } from "@/content/examples";
import { Seal } from "@/components/ui/Seal";
import { lockFilter, prefersReducedMotion, sealLabel, type Plan } from "./shared";

/** Cadeado de linha fina (recursos do plano Luneta). */
export function LockIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true" className={`shrink-0 ${className}`}>
      <rect x="2.5" y="6.2" width="9" height="6.3" rx="1.6" />
      <path d="M4.6 6.2V4.4a2.4 2.4 0 0 1 4.8 0v1.8" />
    </svg>
  );
}

/** Ícone de lente (anéis concêntricos), usado no chip de selo e nos convites à Luneta. */
export function RingsIcon({ rings = 1, size = 14, className = "" }: { rings?: 1 | 2; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className={`shrink-0 ${className}`}>
      <circle cx="7" cy="7" r="6" />
      {rings === 2 && <circle cx="7" cy="7" r="3" />}
    </svg>
  );
}

/**
 * Foto do imóvel em moldura de lente. No plano Luneta a moldura ganha um anel por selo
 * (Na Mira 1 externo, Alvo 2 + brilho de luar); no Lente todas são iguais, para não entregar o selo.
 * No hover do cartão a moldura ganha um anel externo e a foto faz um zoom sutil.
 */
export function LensFrame({
  listing,
  plan,
  size,
  sizeClass,
  label,
}: {
  listing: Listing;
  plan: Plan;
  /** tamanho máximo em px (também usado no `sizes` da foto real) */
  size: number;
  /** tamanho responsivo em classes Tailwind; sem ele, usa `size` fixo */
  sizeClass?: string;
  /** texto alternativo; sem ele a foto é decorativa (o título já está ao lado) */
  label?: string;
}) {
  const seal = plan === "lente" ? -1 : listing.seal;
  const ring =
    seal === 3
      ? "border-[3px] border-latao shadow-[0_0_0_3px_var(--tinta),0_0_0_4.5px_#C9A24D,0_0_0_9px_var(--tinta),0_0_0_10.5px_#C9A24D,0_0_28px_rgba(var(--luar-rgb),.3)]"
      : seal === 2
        ? "border-[3px] border-latao shadow-[0_0_0_3px_var(--tinta),0_0_0_4.5px_#C9A24D] group-hover:shadow-[0_0_0_3px_var(--tinta),0_0_0_4.5px_#C9A24D,0_0_0_9px_var(--tinta),0_0_0_10.5px_rgba(201,162,77,.4)]"
        : seal === 0
          ? "border-2 border-nevoa/45 group-hover:shadow-[0_0_0_3px_var(--tinta),0_0_0_4.5px_rgba(var(--fog-rgb),.4)]"
          : "border-[3px] border-latao group-hover:shadow-[0_0_0_3px_var(--tinta),0_0_0_4.5px_rgba(201,162,77,.45)]";

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full transition-[box-shadow,border-color] duration-500 ease-out ${ring} ${sizeClass ?? ""}`}
      style={sizeClass ? undefined : { width: size, height: size }}
    >
      {listing.photo ? (
        <Image
          src={listing.photo}
          alt={label ?? ""}
          fill
          sizes={`${size}px`}
          className="object-cover transition-[scale] duration-500 ease-out group-hover:scale-[1.04]"
        />
      ) : (
        <div
          {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
          className="photo-placeholder flex h-full w-full items-center justify-center text-center font-mono text-[9px] leading-tight text-[#8E9BB5] transition-[scale] duration-500 ease-out group-hover:scale-[1.04]"
        >
          {size >= 96 ? (
            <>
              foto do
              <br />
              imóvel
            </>
          ) : (
            "foto"
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Rótulo do selo + selo de anéis. No Lente fica desfocado (e escondido de leitores de tela);
 * ao trocar para a Luneta o desfoque sai em 600ms e os anéis se desenham um a um (120ms entre eles).
 */
export function SealBadge({
  listing,
  plan,
  size = 40,
  reverse = false,
  className = "",
}: {
  listing: Listing;
  plan: Plan;
  size?: number;
  /** selo antes do rótulo (drawer) em vez de depois (linha da lista) */
  reverse?: boolean;
  className?: string;
}) {
  const lente = plan === "lente";
  const tone = lente ? "text-nevoa" : listing.seal === 3 ? "text-pos" : listing.seal > 0 ? "text-latao-texto" : "text-nevoa";
  return (
    <div
      aria-hidden={lente || undefined}
      className={`flex items-center gap-2 transition-[filter] duration-[600ms] ease-out select-none motion-reduce:transition-none ${reverse ? "flex-row-reverse justify-end" : ""} ${className}`}
      style={{ filter: lockFilter(lente) }}
    >
      <span className={`text-[10px] leading-none font-semibold tracking-[0.12em] whitespace-nowrap uppercase transition-colors duration-500 ${tone}`}>
        <span className="sr-only">Selo: </span>
        {sealLabel(listing)}
      </span>
      <span
        className={`inline-flex [&_[data-ring]]:[stroke-dasharray:1] [&_[data-ring]]:[transition:stroke-dashoffset_500ms_ease-out_calc(var(--r,0)*120ms_+_150ms)] motion-reduce:[&_[data-ring]]:[transition:none] ${
          lente ? "[&_[data-ring]]:[stroke-dashoffset:1]" : "[&_[data-ring]]:[stroke-dashoffset:0]"
        }`}
      >
        <Seal level={listing.seal} size={size} />
      </span>
    </div>
  );
}

/**
 * Favoritar com alerta de praça. Na Luneta alterna "Favoritar" ↔ "Alerta ativo" (o anel vira sólido
 * com um "pop"); no Lente é um convite: abre o modal de upgrade.
 */
export function FavButton({
  listing,
  plan,
  active,
  long = false,
  onToggle,
  onLocked,
}: {
  listing: Listing;
  plan: Plan;
  active: boolean;
  long?: boolean;
  onToggle: (id: string) => void;
  onLocked: (opener: HTMLElement) => void;
}) {
  const dot = useRef<HTMLSpanElement>(null);
  const lente = plan === "lente";
  const label = lente
    ? long
      ? "Favoritos e alerta de praça · plano Luneta"
      : "Favoritar · Luneta"
    : active
      ? long
        ? "Alerta de praça ativo · remover"
        : "Alerta ativo"
      : long
        ? "Favoritar e avisar quando a praça mudar"
        : "Favoritar";

  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (lente) return onLocked(e.currentTarget);
    if (!active && dot.current && !prefersReducedMotion()) {
      dot.current.animate([{ scale: "1" }, { scale: "1.3" }, { scale: "1" }], { duration: 320, easing: "cubic-bezier(.2,.7,.2,1)" });
    }
    onToggle(listing.id);
  };

  const on = !lente && active;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={lente ? undefined : active}
      aria-haspopup={lente ? "dialog" : undefined}
      className={`relative z-10 inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border font-medium whitespace-nowrap transition-[background-color,border-color,color,scale] duration-150 active:scale-[0.96] ${
        long ? "min-h-12 w-full px-5 text-sm font-semibold" : "min-h-11 px-3.5 text-xs pointer-fine:min-h-9"
      } ${on ? "border-latao bg-latao/15 text-latao-texto" : "border-nevoa/35 text-nevoa hover:border-latao hover:text-luar"}`}
    >
      {lente ? (
        <LockIcon />
      ) : (
        <span
          ref={dot}
          aria-hidden="true"
          className={`size-2.5 shrink-0 rounded-full border-[1.5px] border-current transition-colors duration-150 ${on ? "bg-current" : "bg-transparent"}`}
        />
      )}
      {label}
      {!long && (
        <span className="sr-only">
          ({listing.title}, {listing.place})
        </span>
      )}
    </button>
  );
}

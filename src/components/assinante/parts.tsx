"use client";

import { useCallback, useRef, useState, type MouseEvent } from "react";
import type { Listing, ListingTag } from "@/content/examples";
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

/** Fotos que já falharam nesta visita: a moldura que volta (filtro, gaveta) vai direto ao placeholder, sem pedir de novo. */
const failedPhotos = new Set<string>();

/**
 * Foto do imóvel em moldura de lente. No plano Luneta a moldura ganha um anel por selo
 * (Na Mira 1 externo, Alvo 2 + brilho de luar); no Lente todas são iguais, para não entregar o selo.
 * No hover do cartão a moldura ganha um anel externo e a foto faz um zoom sutil.
 * A foto vem direto da URL da fonte (sem referrer, preguiçosa); se não carregar, volta o placeholder listrado.
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
  /** tamanho máximo em px (decide o texto do placeholder) */
  size: number;
  /** tamanho responsivo em classes Tailwind; sem ele, usa `size` fixo */
  sizeClass?: string;
  /** nome do placeholder para leitores de tela; sem ele o placeholder é decorativo (o título já está ao lado) */
  label?: string;
}) {
  // src da foto que falhou: com outro imóvel na mesma moldura (drawer), a foto nova tem a sua chance
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const photo = listing.photo && listing.photo !== failedSrc && !failedPhotos.has(listing.photo) ? listing.photo : null;
  const fail = useCallback((src: string | null) => {
    if (!src) return;
    failedPhotos.add(src);
    setFailedSrc(src);
  }, []);
  // A foto pode ter falhado antes da hidratação, quando o onError ainda não existia: confere ao montar.
  const checkBroken = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth === 0) fail(img.getAttribute("src"));
  }, [fail]);
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
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- a foto fica na fonte: o otimizador do next/image a baixaria e re-hospedaria na Vercel
        <img
          ref={checkBroken}
          src={photo}
          alt={`Foto do imóvel${listing.source ? ` no site da fonte (${listing.source.leiloeiro})` : ""}: ${listing.title}, ${listing.place}`}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => fail(photo)}
          className="absolute inset-0 size-full object-cover transition-[scale] duration-500 ease-out group-hover:scale-[1.04]"
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

/** Selo genérico do Lente: o mesmo desenho em todo cartão, para não entregar o nível. */
const GENERIC_SEAL = 2;

/**
 * Rótulo do selo + selo de anéis. No Lente o selo real nem vai para o DOM: aparece um marcador neutro,
 * igual em todo cartão (rótulo fixo "Selo · Luneta" e um selo genérico desfocado, de largura fixa).
 * Ao trocar para a Luneta o desfoque sai em 600ms e os anéis se desenham um a um (120ms entre eles).
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
    <div className={`flex items-center gap-2 select-none ${reverse ? "flex-row-reverse justify-end" : ""} ${className}`}>
      <span className={`text-[10px] leading-none font-semibold tracking-[0.12em] whitespace-nowrap uppercase transition-colors duration-500 ${tone}`}>
        {lente ? (
          <>
            <span aria-hidden="true">Selo · Luneta</span>
            <span className="sr-only">Selo: recurso do plano Luneta</span>
          </>
        ) : (
          <>
            <span className="sr-only">Selo: </span>
            {sealLabel(listing)}
          </>
        )}
      </span>
      <span
        aria-hidden="true"
        className={`inline-flex transition-[filter] duration-[600ms] ease-out motion-reduce:transition-none [&_[data-ring]]:[stroke-dasharray:1] [&_[data-ring]]:[transition:stroke-dashoffset_500ms_ease-out_calc(var(--r,0)*120ms_+_150ms)] motion-reduce:[&_[data-ring]]:[transition:none] ${
          lente ? "[&_[data-ring]]:[stroke-dashoffset:1]" : "[&_[data-ring]]:[stroke-dashoffset:0]"
        }`}
        style={{ filter: lockFilter(lente) }}
      >
        <Seal level={lente ? GENERIC_SEAL : listing.seal} size={size} />
      </span>
    </div>
  );
}

/** Larguras dos marcadores de tag no Lente: as mesmas em todo cartão (não entregam quantas tags há, nem quais). */
const TAG_SLOTS = ["w-[72px]", "w-24", "w-[60px]"] as const;

/** Marcadores neutros no lugar das tags de risco (plano Lente): sem texto, sem cor de gravidade. */
export function TagPlaceholders({ large = false }: { large?: boolean }) {
  return (
    <div aria-hidden="true" className="flex flex-wrap gap-1.5">
      {TAG_SLOTS.map((w) => (
        <span key={w} className={`block rounded-full border border-nevoa/45 bg-nevoa/10 ${large ? "h-[31px]" : "h-[26px]"} ${w}`} />
      ))}
    </div>
  );
}

/**
 * Tags calculadas automaticamente que ainda aguardam leitura humana (casos reais): ficam à parte, sob
 * o rótulo "em revisão", em estilo neutro (borda tracejada, sem cor nem ícone de gravidade), nunca como fato.
 */
export function ReviewTags({ tags, large = false }: { tags: ListingTag[] | undefined; large?: boolean }) {
  if (!tags?.length) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${large ? "mt-3" : "mt-2"}`}>
      <p className="mr-0.5 text-[11px] leading-snug font-medium text-nevoa">Em revisão (classificação automática):</p>
      <ul aria-label="Tags em revisão (classificação automática)" className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <li key={t.label}>
            <span
              className={`inline-flex items-center rounded-full border border-dashed border-nevoa/60 leading-none font-medium whitespace-nowrap text-nevoa ${
                large ? "px-3 py-2 text-[13px]" : "px-2.5 py-1.5 text-xs"
              }`}
            >
              <span className="sr-only">Em revisão: </span>
              {t.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Favoritar com alerta de praça. Na Luneta alterna "Favoritar" ↔ "Alerta ativo" (o anel vira sólido
 * com um "pop"); no Lente é um convite: abre o modal de upgrade.
 * O estado vai só no rótulo (sem aria-pressed), para o leitor de tela não ouvir nome e estado trocando
 * juntos ("Alerta ativo, pressionado"); o nome acessível é sempre o texto visível.
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
      aria-haspopup={lente ? "dialog" : undefined}
      className={`relative z-10 inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border font-medium transition-[background-color,border-color,color,scale] duration-150 active:scale-[0.96] ${
        long
          ? "min-h-12 w-full px-5 py-2.5 text-center text-sm leading-snug font-semibold text-balance whitespace-normal"
          : "min-h-11 px-3.5 text-xs whitespace-nowrap pointer-fine:min-h-9"
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
          {on && " · remover"} ({listing.title}, {listing.place})
        </span>
      )}
    </button>
  );
}

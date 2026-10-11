import Image from "next/image";
import { brl, type Listing } from "@/content/examples";
import { Seal, SEAL_NAMES } from "@/components/ui/Seal";
import { Tag } from "@/components/ui/Tag";

const RING_LABEL = ["só tags", "1 anel", "2 anéis", "3 anéis"] as const;

/** Moldura de lente: anel de latão + um anel externo por nível de selo. */
function LensPhoto({ listing, size }: { listing: Listing; size: number }) {
  const { seal } = listing;
  const rings =
    seal === 3
      ? "border-[3px] border-latao shadow-[0_0_0_3px_var(--tinta),0_0_0_4.5px_#C9A24D,0_0_0_9px_var(--tinta),0_0_0_10.5px_#C9A24D,0_0_28px_rgba(var(--luar-rgb),.35)]"
      : seal === 2
        ? "border-[3px] border-latao shadow-[0_0_0_3px_var(--tinta),0_0_0_4.5px_#C9A24D] group-hover:shadow-[0_0_0_3px_var(--tinta),0_0_0_4.5px_#C9A24D,0_0_0_9px_var(--tinta),0_0_0_10.5px_rgba(201,162,77,.35)]"
        : seal === 1
          ? "border-[3px] border-latao group-hover:shadow-[0_0_0_3px_var(--tinta),0_0_0_4.5px_rgba(201,162,77,.35)]"
          : "border-2 border-nevoa/40";
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full transition-shadow duration-300 ${rings}`}
      style={{ width: size, height: size }}
    >
      {listing.photo ? (
        <Image
          src={listing.photo}
          alt={`Foto do imóvel: ${listing.title}, ${listing.place}`}
          fill
          sizes={`${size}px`}
          className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        />
      ) : (
        <div
          role="img"
          aria-label="Foto do imóvel (placeholder)"
          className={`photo-placeholder flex h-full w-full items-center justify-center text-center font-mono text-[10px] leading-tight text-nevoa transition-transform duration-500 group-hover:scale-[1.04] ${
            seal === 0 ? "blur-[1px]" : seal === 1 ? "blur-[0.4px]" : ""
          }`}
        >
          foto do
          <br />
          imóvel
        </div>
      )}
    </div>
  );
}

/**
 * Cartão de leilão: foto em moldura de lente, endereço parcial, avaliação, lance mínimo, deságio,
 * praça, selo (1 a 3 anéis) e tags de risco (cor por gravidade, sempre com ícone e texto).
 * No Alvo, o deságio aparece em verde gigante, com a mira travada sobre o cartão.
 *
 * `locked` = visão do plano Lente: tags e selo ficam desfocados, como convite ao upgrade.
 */
export function AuctionCard({
  listing,
  locked = false,
  compact = false,
  headingLevel = 3,
}: {
  listing: Listing;
  locked?: boolean;
  compact?: boolean;
  headingLevel?: 3 | 4;
}) {
  const l = listing;
  const alvo = l.seal === 3;
  const H = `h${headingLevel}` as "h3" | "h4";
  const sealTone = alvo ? "text-pos" : l.seal > 0 ? "text-latao-texto" : "text-nevoa";
  const lockCls = locked ? "blur-[5px] select-none" : "";

  return (
    <article
      aria-label={`Exemplo fictício: ${l.title}, ${l.place}, ${SEAL_NAMES[l.seal]}`}
      className={`group relative overflow-hidden rounded-[20px] bg-tinta transition-[transform,border-color,box-shadow] duration-300 ease-luneta hover:-translate-y-1 ${
        compact ? "p-4" : "p-6"
      } ${
        alvo
          ? "border-[1.5px] border-latao/70 shadow-[0_0_0_1px_rgba(201,162,77,.2),0_0_80px_rgba(var(--luar-rgb),.08)]"
          : "border border-nevoa/20 hover:border-latao/55 hover:shadow-[0_20px_50px_rgba(0,0,0,.25)]"
      }`}
    >
      {alvo && !locked && (
        <>
          {/* mira travada sobre o cartão */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(var(--luar-rgb),.06)_1px,transparent_1px),linear-gradient(90deg,rgba(var(--luar-rgb),.06)_1px,transparent_1px)] bg-[length:100%_50%,50%_100%] bg-[position:50%_0,0_50%] bg-no-repeat"
          />
          <div aria-hidden="true" className="absolute top-4 right-4 transition-transform duration-[1.2s] ease-luneta group-hover:rotate-90">
            <svg width="44" height="44" viewBox="-8 -8 60 60" className="overflow-visible drop-shadow-[0_0_7px_rgba(var(--luar-rgb),.4)]">
              <circle cx="22" cy="22" r="21" fill="none" stroke="var(--luar)" strokeWidth="1.5" />
              <path d="M22 -7v10M22 41v10M-7 22h10M41 22h10" stroke="var(--luar)" strokeWidth="1.5" />
              <circle cx="22" cy="22" r="2" fill="#4ADE9A" />
            </svg>
          </div>
        </>
      )}

      <p className="text-[10px] font-medium tracking-[0.14em] text-nevoa uppercase">Exemplo fictício</p>

      <div className="mt-4 flex items-center gap-3.5">
        <LensPhoto listing={l} size={compact ? 64 : 84} />
        <div className="min-w-0">
          <p className={`flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.14em] uppercase ${sealTone} ${lockCls}`} aria-hidden={locked || undefined}>
            {l.seal > 0 && <Seal level={l.seal} size={18} />}
            {SEAL_NAMES[l.seal]} · {RING_LABEL[l.seal]}
          </p>
          <H className="mt-1.5 font-display text-lg leading-tight font-bold tracking-[-0.01em]">{l.title}</H>
          <p className="mt-0.5 text-[13px] leading-snug text-nevoa">{l.place}</p>
        </div>
      </div>

      <p
        className={`mt-5 font-display leading-[0.9] font-bold ${
          alvo
            ? "text-[clamp(56px,6vw,80px)] tracking-[-0.05em] text-pos transition-[text-shadow] duration-300 group-hover:[text-shadow:0_0_30px_rgba(74,222,154,.45)]"
            : `text-[44px] tracking-[-0.04em] ${l.seal === 0 ? "text-nevoa" : "text-luar"}`
        } ${compact ? "!text-4xl" : ""}`}
      >
        −{l.desagio}%<span className="sr-only"> de deságio</span>
      </p>
      <p aria-hidden="true" className="mt-2 text-xs font-medium tracking-[0.06em] text-nevoa uppercase">
        deságio
      </p>

      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13px] leading-snug text-nevoa">
        <div>
          <dt>Avaliação</dt>
          <dd className="font-semibold text-luar">{brl(l.avaliacao)}</dd>
        </div>
        <div>
          <dt>Lance mínimo</dt>
          <dd className="font-semibold text-luar">{brl(l.lance)}</dd>
        </div>
        <div>
          <dt>Praça</dt>
          <dd className="font-semibold text-luar">
            {l.praca} · {l.date}
          </dd>
        </div>
        {alvo && (
          <div className={lockCls} aria-hidden={locked || undefined}>
            <dt>Status</dt>
            <dd className="font-semibold text-luar">Nenhum risco identificado</dd>
          </div>
        )}
      </dl>

      <div className="relative mt-4">
        <ul data-tags aria-label={locked ? undefined : "Tags de risco"} aria-hidden={locked || undefined} className={`flex flex-wrap gap-1.5 ${lockCls}`}>
          {l.tags.map((t) => (
            <li key={t.label}>
              <Tag {...t} />
            </li>
          ))}
        </ul>
        {locked && (
          <p className="absolute inset-0 flex items-center justify-center">
            <span className="rounded-full border border-latao/60 bg-noite/85 px-3 py-1.5 text-[11px] font-semibold text-latao-texto">
              Tags e selo visíveis no plano Luneta
            </span>
          </p>
        )}
      </div>
    </article>
  );
}

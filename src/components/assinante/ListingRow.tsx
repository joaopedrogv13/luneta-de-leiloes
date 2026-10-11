"use client";

import { listingLabel, brl, type Listing } from "@/content/examples";
import { Tag } from "@/components/ui/Tag";
import { FavButton, LensFrame, LockIcon, SealBadge } from "./parts";
import { lockFilter, splitPlace, type Plan } from "./shared";

/**
 * Uma linha da lista (layout do protótipo): foto em moldura de lente, título + praça, local e data,
 * avaliação e lance mínimo, tags de risco, deságio grande, selo e Favoritar.
 * O título é um <button> cujo ::after cobre o cartão inteiro: clicar em qualquer ponto abre o detalhe,
 * e pelo teclado é um único botão (o Favoritar fica por cima, sem botões aninhados).
 */
export function ListingRow({
  listing: l,
  plan,
  fav,
  active,
  onOpen,
  onHover,
  onFav,
  onLocked,
}: {
  listing: Listing;
  plan: Plan;
  fav: boolean;
  /** mouse sobre o cartão ou sobre o pin, ou detalhe aberto */
  active: boolean;
  onOpen: (id: string, opener: HTMLElement) => void;
  onHover: (id: string | null) => void;
  onFav: (id: string) => void;
  onLocked: (opener: HTMLElement) => void;
}) {
  const lente = plan === "lente";
  const alvo = !lente && l.seal === 3;
  const { bairro, cidadeUf } = splitPlace(l.place);
  const desTone = lente ? "text-luar" : alvo ? "text-pos" : l.seal === 0 ? "text-nevoa" : "text-luar";
  const frame = active
    ? "border-latao/60 shadow-[0_18px_50px_rgba(0,0,0,.22)]"
    : alvo
      ? "border-latao/60 shadow-[0_0_50px_rgba(var(--luar-rgb),.06)]"
      : "border-nevoa/15";

  return (
    <li onMouseEnter={() => onHover(l.id)} onMouseLeave={() => onHover(null)}>
      <article
        className={`group relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-3 rounded-[18px] border bg-tinta p-4 transition-[translate,border-color,box-shadow] duration-200 ease-out [grid-template-areas:'foto_head_des'_'meta_meta_meta'_'tags_tags_tags'_'selo_selo_fav'] hover:-translate-y-[3px] hover:border-latao/55 hover:shadow-[0_18px_50px_rgba(0,0,0,.25)] has-[:focus-visible]:border-latao/70 sm:gap-x-[18px] sm:p-[18px] sm:[grid-template-areas:'foto_head_des'_'foto_meta_selo'_'foto_tags_fav'] ${frame}`}
      >
        <div className="self-start [grid-area:foto] sm:self-center">
          <LensFrame listing={l} plan={plan} size={76} sizeClass="size-14 sm:size-[76px]" />
        </div>

        <div className="min-w-0 self-start [grid-area:head] sm:self-end">
          <p className="text-[10px] leading-none font-medium tracking-[0.14em] text-nevoa uppercase">{listingLabel(l)}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <h2 className="font-display text-base leading-tight font-bold tracking-[-0.01em] sm:text-[17px]">
              <button
                type="button"
                data-open={l.id}
                aria-haspopup="dialog"
                onClick={(e) => onOpen(l.id, e.currentTarget)}
                onFocus={() => onHover(l.id)}
                onBlur={() => onHover(null)}
                className="cursor-pointer text-left after:absolute after:inset-0 after:rounded-[18px] after:content-['']"
              >
                {l.title}
              </button>
            </h2>
            <span className="rounded-full border border-nevoa/30 px-2 py-1 text-[11px] leading-none font-medium whitespace-nowrap text-nevoa">
              {l.praca}
            </span>
          </div>
        </div>

        <div className="min-w-0 self-start [grid-area:meta] sm:-mt-2">
          <p className="text-[13px] leading-snug text-nevoa">
            {bairro} · {cidadeUf} · encerra {l.date}
          </p>
          <dl className="mt-2.5 flex flex-wrap gap-x-[18px] gap-y-1 text-xs leading-snug text-nevoa">
            <div className="flex gap-1">
              <dt>Avaliação</dt>
              <dd className="font-semibold text-luar">{brl(l.avaliacao)}</dd>
            </div>
            <div className="flex gap-1">
              <dt>Lance mínimo</dt>
              <dd className="font-semibold text-luar">{brl(l.lance)}</dd>
            </div>
          </dl>
        </div>

        <p
          className={`self-start text-right font-display text-[26px] leading-[0.9] font-bold tracking-[-0.04em] transition-colors duration-500 [grid-area:des] sm:self-center sm:text-[34px] ${desTone}`}
        >
          −{l.desagio}%<span className="sr-only"> de deságio</span>
        </p>

        {/* Tags e selo não são interativos: com pointer-events-none o clique passa para o ::after do título
            (o filter do desfoque cria uma camada própria, que ficaria por cima dele). */}
        <div className="pointer-events-none relative min-w-0 [grid-area:tags]">
          <ul
            aria-label={lente ? undefined : "Tags de risco"}
            aria-hidden={lente || undefined}
            className="flex flex-wrap gap-1.5 select-none"
          >
            {l.tags.map((t, i) => (
              <li
                key={t.label}
                className="transition-[filter] duration-[600ms] ease-out motion-reduce:transition-none"
                style={{ filter: lockFilter(lente), transitionDelay: `${i * 60}ms` }}
              >
                <Tag {...t} />
              </li>
            ))}
          </ul>
          {lente && (
            <p className="absolute inset-0 flex items-center transition-opacity duration-300 starting:opacity-0">
              <span className="inline-flex items-center gap-2 rounded-full bg-tinta/85 px-2.5 py-1.5 text-[11px] leading-none font-semibold tracking-[0.08em] text-latao-texto uppercase">
                <LockIcon />
                Tags de risco · plano Luneta
              </span>
            </p>
          )}
        </div>

        <SealBadge listing={l} plan={plan} className="pointer-events-none justify-self-start [grid-area:selo] sm:justify-self-end" />

        <div className="justify-self-end [grid-area:fav]">
          <FavButton listing={l} plan={plan} active={fav} onToggle={onFav} onLocked={onLocked} />
        </div>
      </article>
    </li>
  );
}

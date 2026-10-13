"use client";

import { listingLabel, brl, type Listing } from "@/content/examples";
import { Tag } from "@/components/ui/Tag";
import { FavButton, LensFrame, LockIcon, ReviewTags, SealBadge, TagPlaceholders } from "./parts";
import { desagioView, lockFilter, pracaLabel, splitPlace, type Plan } from "./shared";

/**
 * Uma linha da lista (layout do protótipo): foto em moldura de lente, título + praça, local e data,
 * avaliação e lance mínimo, tags de risco, deságio grande, selo e Favoritar.
 * O título é um <button> cujo ::after cobre o cartão inteiro: clicar em qualquer ponto abre o detalhe,
 * e pelo teclado é um único botão (o Favoritar fica por cima, sem botões aninhados).
 * O hover vem do <li>, que não se move: o cartão sobe 3px sem "tremer" com o mouse na borda de baixo.
 * No celular, selo e Favoritar ficam numa linha própria (a 3ª coluna é só do deságio, e o título respira).
 * Casos reais (/previa): praça não informada, lance acima da avaliação e tags em revisão (à parte, neutras).
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
  const des = desagioView(l);
  const desTone = lente ? "text-luar" : alvo ? "text-pos" : l.seal === 0 ? "text-nevoa" : "text-luar";
  const frame = active
    ? "border-latao/60 shadow-[0_18px_50px_rgba(0,0,0,.22)]"
    : alvo
      ? "border-latao/60 shadow-[0_0_50px_rgba(var(--luar-rgb),.06)]"
      : "border-nevoa/15";

  return (
    // group/row: o hover do cartão; group (sem nome): o hover da moldura de lente (LensFrame), também pelo <li>
    <li className="group group/row" onMouseEnter={() => onHover(l.id)} onMouseLeave={() => onHover(null)}>
      <article
        className={`relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-3 rounded-[18px] border bg-tinta p-4 transition-[translate,border-color,box-shadow] duration-200 ease-out [grid-template-areas:'foto_head_des'_'meta_meta_meta'_'tags_tags_tags'_'acts_acts_acts'] group-hover/row:-translate-y-[3px] group-hover/row:border-latao/55 group-hover/row:shadow-[0_18px_50px_rgba(0,0,0,.25)] has-[:focus-visible]:border-latao/70 sm:gap-x-[18px] sm:p-[18px] sm:[grid-template-areas:'foto_head_des'_'foto_meta_selo'_'foto_tags_fav'] ${frame}`}
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
            <span
              className={`${l.praca ? "rounded-full" : "rounded-[10px]"} border border-nevoa/30 px-2 py-1 text-[11px] ${l.praca ? "leading-none font-medium whitespace-nowrap" : "leading-tight font-medium"} text-nevoa`}
            >
              {pracaLabel(l)}
            </span>
          </div>
        </div>

        <div className="min-w-0 self-start [grid-area:meta] sm:-mt-2">
          {/* caso real sem bairro ("Cidade/UF") ou sem data da praça: sem separador sobrando nem "encerra data não informada" */}
          <p className="text-[13px] leading-snug text-nevoa">
            {cidadeUf ? (
              <>
                {bairro} · {cidadeUf}
              </>
            ) : (
              bairro
            )}
            {l.dataPraca === null ? <> · {l.date}</> : <> · encerra {l.date}</>}
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

        {des.note ? (
          // lance igual ou acima da avaliação (casos reais): número menor e a nota, em vez de um "−" que confunde
          <p className="flex flex-col items-end self-start text-right [grid-area:des] sm:self-center">
            <span className="block font-display text-xl leading-none font-bold tracking-[-0.03em] text-nevoa sm:text-2xl">{des.value}</span>
            <span className="mt-1 block max-w-[12ch] text-[11px] leading-tight text-nevoa">{des.note}</span>
          </p>
        ) : (
          <p
            className={`self-start text-right font-display text-[26px] leading-[0.9] font-bold tracking-[-0.04em] transition-colors duration-500 [grid-area:des] sm:self-center sm:text-[34px] ${desTone}`}
          >
            −{l.desagio}%<span className="sr-only"> de deságio</span>
          </p>
        )}

        {/* Tags e selo não são interativos: com pointer-events-none o clique passa para o ::after do título
            (o filter do desfoque cria uma camada própria, que ficaria por cima dele).
            No Lente as tags reais nem vão para o DOM: só marcadores neutros, iguais em todo cartão. */}
        <div className="pointer-events-none relative min-w-0 [grid-area:tags]">
          <div
            className="transition-[filter] duration-[600ms] ease-out select-none motion-reduce:transition-none"
            style={{ filter: lockFilter(lente) }}
          >
            {lente ? (
              <TagPlaceholders />
            ) : (
              <>
                <ul aria-label="Tags de risco" className="flex flex-wrap gap-1.5">
                  {l.tags.map((t) => (
                    <li key={t.label}>
                      <Tag {...t} />
                    </li>
                  ))}
                </ul>
                <ReviewTags tags={l.tagsEmRevisao} />
              </>
            )}
          </div>
          {lente && (
            <p className="absolute inset-0 flex items-center transition-opacity duration-300 starting:opacity-0">
              <span className="inline-flex items-center gap-2 rounded-full bg-tinta/85 px-2.5 py-1.5 text-[11px] leading-none font-semibold tracking-[0.08em] text-latao-texto uppercase">
                <LockIcon />
                Tags de risco · plano Luneta
              </span>
            </p>
          )}
        </div>

        {/* celular: uma linha só para selo + Favoritar; sm+: `contents`, e cada um vai para a sua área */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 [grid-area:acts] sm:contents">
          <SealBadge listing={l} plan={plan} className="pointer-events-none sm:justify-self-end sm:[grid-area:selo]" />
          <div className="ml-auto sm:ml-0 sm:justify-self-end sm:[grid-area:fav]">
            <FavButton listing={l} plan={plan} active={fav} onToggle={onFav} onLocked={onLocked} />
          </div>
        </div>
      </article>
    </li>
  );
}

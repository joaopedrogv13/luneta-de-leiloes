"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, type RefObject } from "react";
import { formatDate, listingLabel, brl, type Listing } from "@/content/examples";
import { Tag } from "@/components/ui/Tag";
import { FavButton, LensFrame, LockIcon, SealBadge, TagPlaceholders } from "./parts";
import { lockFilter, type Plan } from "./shared";
import { useDialog } from "./useDialog";

/**
 * Detalhe do exemplo: drawer da direita (480px; tela cheia no celular) que desliza em 420ms com
 * cubic-bezier(.2,.7,.2,1), com o fundo escurecendo. Fica montado o tempo todo (para animar a saída)
 * e, fechado, fica `inert` e invisível. As tags entram em cascata a cada abertura.
 * No Lente, tags e explicação reais não vão para o DOM: só marcadores neutros sob o cartão de bloqueio.
 */
export function DetailDrawer({
  open,
  listing: l,
  openSeq,
  plan,
  fav,
  openerRef,
  onClose,
  onFav,
  onLocked,
  onUnlock,
}: {
  open: boolean;
  listing: Listing;
  /** muda a cada abertura, para refazer a cascata das tags */
  openSeq: number;
  plan: Plan;
  fav: boolean;
  openerRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onFav: (id: string) => void;
  onLocked: (opener: HTMLElement) => void;
  /** "Assinar Luneta" do cartão de bloqueio: troca a demo para a Luneta */
  onUnlock: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const tagsHeading = useRef<HTMLHeadingElement>(null);
  const lente = plan === "lente";

  // O painel fica montado: sem isso, reabriria na rolagem anterior (topo cortado e o foco inicial,
  // no botão Fechar, fora da tela). Roda antes do efeito do useDialog, que move o foco.
  useLayoutEffect(() => {
    if (open && panel.current) panel.current.scrollTop = 0;
  }, [open, l.id, openSeq]);

  useDialog({
    open,
    dialogRef: panel,
    onClose,
    initialFocusRef: closeBtn,
    openerRef,
    // aberto por um pin do mapa que sumiu (a janela encolheu e o mapa saiu): o foco volta ao cartão
    fallbackFocus: () =>
      document.querySelector<HTMLElement>(`[data-open="${CSS.escape(l.id)}"]`) ?? document.getElementById("conteudo"),
  });

  const unlock = () => {
    onUnlock();
    // o cartão de bloqueio some: o foco vai para o título das tags, agora nítidas
    requestAnimationFrame(() => tagsHeading.current?.focus({ preventScroll: true }));
  };

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-noite-fixa/60 transition-opacity duration-300 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="detalhe-titulo"
        tabIndex={-1}
        inert={!open}
        className={`fixed inset-y-0 right-0 z-[41] w-full overflow-y-auto overscroll-contain border-l border-latao/35 bg-tinta shadow-[-30px_0_80px_rgba(0,0,0,.4)] outline-none sm:w-[480px] motion-reduce:transition-none ${
          open
            ? "visible translate-x-0 [transition:translate_420ms_cubic-bezier(.2,.7,.2,1),visibility_0s]"
            : "invisible translate-x-[104%] [transition:translate_420ms_cubic-bezier(.2,.7,.2,1),visibility_0s_420ms]"
        }`}
      >
        <div key={`${l.id}-${openSeq}`} className="flex flex-col gap-5 px-5 pt-5 pb-8 sm:px-6">
          <div className="flex items-center justify-between">
            <p className="text-[10px] leading-none font-medium tracking-[0.14em] text-nevoa uppercase">{listingLabel(l)}</p>
            <button
              ref={closeBtn}
              type="button"
              onClick={onClose}
              aria-label="Fechar detalhe"
              className="grid size-11 cursor-pointer place-items-center rounded-full border border-nevoa/30 text-luar transition-colors hover:border-latao"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <path d="M2.5 2.5l9 9M11.5 2.5l-9 9" />
              </svg>
            </button>
          </div>

          <div className="flex items-center gap-4">
            <LensFrame listing={l} plan={plan} size={112} sizeClass="size-24 sm:size-28" label={`Foto do imóvel (ainda não disponível): ${l.title}`} />
            <div className="min-w-0">
              <SealBadge listing={l} plan={plan} size={28} reverse />
              <h2 id="detalhe-titulo" className="mt-2 font-display text-[22px] leading-[1.15] font-bold tracking-[-0.02em]">
                {l.title}
              </h2>
              <p className="mt-1 text-[13px] leading-snug text-nevoa">{l.place}</p>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-2.5">
            <div className="card-on-tinta !rounded-[14px] p-3.5">
              <dt className="text-[11px] font-medium text-nevoa">Deságio</dt>
              <dd
                className={`mt-1.5 font-display text-[34px] leading-none font-bold tracking-[-0.04em] ${
                  lente ? "text-luar" : l.seal === 3 ? "text-pos" : l.seal === 0 ? "text-nevoa" : "text-luar"
                }`}
              >
                −{l.desagio}%
              </dd>
            </div>
            <div className="card-on-tinta !rounded-[14px] p-3.5">
              <dt className="text-[11px] font-medium text-nevoa">Lance mínimo</dt>
              <dd className="mt-2 font-display text-xl leading-tight font-bold tracking-[-0.02em]">{brl(l.lance)}</dd>
              <dd className="mt-1 text-[11px] leading-snug text-nevoa">avaliação {brl(l.avaliacao)}</dd>
            </div>
          </dl>

          <p className="card-on-tinta flex items-center gap-2.5 !rounded-[14px] px-3.5 py-3 text-[13px] leading-snug">
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-latao" />
            <span>
              <strong className="font-semibold">{l.praca}</strong> · encerra {l.date}
            </span>
          </p>

          <section aria-labelledby="detalhe-tags">
            <h3
              id="detalhe-tags"
              ref={tagsHeading}
              tabIndex={-1}
              className="mb-2.5 text-[11px] leading-none font-semibold tracking-[0.14em] text-nevoa uppercase"
            >
              Tags de risco
            </h3>
            <div className="grid">
              <div
                className={`transition-[filter] duration-[600ms] ease-out select-none [grid-area:1/1] motion-reduce:transition-none ${lente ? "pointer-events-none" : ""}`}
                style={{ filter: lockFilter(lente) }}
              >
                {lente ? (
                  <div aria-hidden="true">
                    <TagPlaceholders large />
                    <div className="mt-4 flex flex-col gap-2.5">
                      <span className="block h-2.5 w-full rounded-full bg-nevoa/20" />
                      <span className="block h-2.5 w-[88%] rounded-full bg-nevoa/20" />
                      <span className="block h-2.5 w-3/5 rounded-full bg-nevoa/20" />
                    </div>
                  </div>
                ) : (
                  <>
                    <ul className="flex flex-wrap gap-1.5">
                      {l.tags.map((t, i) => (
                        <li
                          key={t.label}
                          className="transition-[opacity,translate] duration-500 ease-out starting:translate-y-2 starting:opacity-0 motion-reduce:transition-none"
                          style={{ transitionDelay: `${150 + i * 60}ms` }}
                        >
                          <Tag {...t} className="!px-3 !py-2 !text-[13px]" />
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-[13px] leading-relaxed text-nevoa">{l.why}</p>
                  </>
                )}
              </div>
              {lente && (
                <div className="relative z-10 flex flex-col items-start gap-2.5 self-start rounded-[14px] border border-latao/50 bg-tinta/90 p-4 transition-opacity duration-300 [grid-area:1/1] starting:opacity-0">
                  <p className="flex items-center gap-2 font-display text-[15px] leading-snug font-bold">
                    <LockIcon className="text-latao-texto" />
                    Veja o que este desconto esconde.
                  </p>
                  <p className="text-[13px] leading-normal text-nevoa">Tags de risco, selo e explicação ficam visíveis no plano Luneta.</p>
                  <button type="button" onClick={unlock} className="btn-primary !min-h-11 !px-4 !text-[13px]">
                    Assinar Luneta
                  </button>
                </div>
              )}
            </div>
          </section>

          <div className="mt-1 flex flex-col gap-2.5">
            <FavButton listing={l} plan={plan} active={fav} long onToggle={onFav} onLocked={onLocked} />
            <Link href="/#advogado" className="btn-primary w-full !whitespace-normal text-center">
              Falar com um advogado sobre este leilão
            </Link>
            {l.source ? (
              <>
                <a
                  href={l.source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-outline w-full !whitespace-normal text-center"
                >
                  Ver este leilão no {l.source.leiloeiro} <span aria-hidden="true">↗</span>
                  <span className="sr-only"> (abre em nova aba)</span>
                </a>
                <p className="-mt-1 text-center text-xs text-nevoa">
                  Dados coletados em {formatDate(l.source.coletadoEm)}. Preços e datas podem mudar: confira o edital.
                </p>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled
                  aria-describedby="edital-nota"
                  className="inline-flex min-h-11 cursor-not-allowed items-center justify-center gap-1.5 rounded-full text-[13px] font-medium text-nevoa opacity-70"
                >
                  Abrir edital no site do leiloeiro <span aria-hidden="true">↗</span>
                </button>
                <p id="edital-nota" className="-mt-1.5 text-center text-xs text-nevoa">
                  exemplo fictício: sem anúncio de verdade por trás
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

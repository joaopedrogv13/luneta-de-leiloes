"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LISTINGS } from "@/content/examples";
import { RichText } from "@/components/ui/RichText";
import { AppHeader } from "./AppHeader";
import { DetailDrawer } from "./DetailDrawer";
import { FilterBar } from "./FilterBar";
import { ListingRow } from "./ListingRow";
import { MapPanel } from "./MapPanel";
import { RingsIcon } from "./parts";
import { LUNETA_PRICE, NO_FILTERS, OPEN_FILTERS, matchesQuery, type FilterKey, type Filters, type Plan } from "./shared";
import { UpgradeModal } from "./UpgradeModal";

type Toast = { id: number; text: string; leaving: boolean };

const TOAST_FAV = "Você será avisado por e-mail quando a praça mudar (demonstração).";
const TOAST_PLAN = "Plano Luneta ativado nesta demonstração: tags e selos nítidos. Nenhuma cobrança foi feita.";

/**
 * Área do assinante (demonstração, só front-end): filtros, busca, lista em linhas, mapa e detalhe,
 * vista como plano Lente (tags e selos desfocados) ou Luneta (tudo nítido). Começa na Luneta;
 * ?plano=lente na URL começa no Lente. Usa só os exemplos fictícios de src/content/examples.ts.
 */
export function AssinanteApp({ initialPlan }: { initialPlan: Plan }) {
  // O plano inicial vem do servidor (page.tsx lê ?plano=lente), para o Lente já sair no HTML:
  // sem pintar a Luneta primeiro e trocar na hidratação (sem flash nem salto do banner).
  const [plan, setPlanState] = useState<Plan>(initialPlan);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [shownId, setShownId] = useState(LISTINGS[0].id);
  const [openSeq, setOpenSeq] = useState(0);
  const [upsellOpen, setUpsellOpen] = useState(false);
  const [favs, setFavs] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<Toast | null>(null);

  const drawerOpener = useRef<HTMLElement | null>(null);
  const modalOpener = useRef<HTMLElement | null>(null);
  const lunetaBtn = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const lente = plan === "lente";

  // O toast some sozinho (fade de 300ms antes de sair).
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(
      () => (toast.leaving ? setToast(null) : setToast({ ...toast, leaving: true })),
      toast.leaving ? 300 : 3600,
    );
    return () => window.clearTimeout(t);
  }, [toast]);

  const showToast = (text: string) => setToast({ id: Date.now(), text, leaving: false });

  const setPlan = useCallback((p: Plan) => {
    setPlanState(p);
    // "Só com selo" revelaria quem tem selo: no Lente o filtro é desligado.
    if (p === "lente") setFilters((f) => ({ ...f, selo: false }));
    const url = new URL(window.location.href);
    if (p === "lente") url.searchParams.set("plano", "lente");
    else url.searchParams.delete("plano");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, []);

  const results = useMemo(
    () =>
      LISTINGS.filter(
        (l) =>
          OPEN_FILTERS.every((f) => !filters[f.key] || f.test(l)) &&
          (!filters.selo || lente || l.seal > 0) &&
          matchesQuery(l, query),
      ).sort((a, b) => b.desagio - a.desagio),
    [filters, lente, query],
  );

  const openDetail = (id: string, opener: HTMLElement) => {
    drawerOpener.current = opener;
    setShownId(id);
    setOpenId(id);
    setOpenSeq((n) => n + 1);
  };
  const closeDetail = useCallback(() => setOpenId(null), []);

  const openUpsell = (opener: HTMLElement) => {
    modalOpener.current = opener;
    setUpsellOpen(true);
  };
  const closeUpsell = useCallback(() => setUpsellOpen(false), []);

  const toggleFilter = (k: FilterKey) => setFilters((f) => ({ ...f, [k]: !f[k] }));

  const toggleFav = (id: string) => {
    const next = !favs[id];
    setFavs((s) => ({ ...s, [id]: next }));
    if (next) showToast(TOAST_FAV);
  };

  /** "Assinar Luneta" em qualquer convite: só troca a demonstração para a Luneta. */
  const upgrade = (from: "modal" | "banner" | "drawer") => {
    setPlan("luneta");
    showToast(TOAST_PLAN);
    if (from === "modal") setUpsellOpen(false);
    // o banner some com a troca: o foco vai para o botão "Luneta" do cabeçalho, agora ativo
    if (from === "banner") requestAnimationFrame(() => lunetaBtn.current?.focus());
  };

  const clearAll = () => {
    setFilters(NO_FILTERS);
    setQuery("");
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>("[data-open]")?.focus());
  };

  const shown = LISTINGS.find((l) => l.id === shownId) ?? LISTINGS[0];
  const activeId = hoverId ?? openId;

  return (
    <>
      <AppHeader plan={plan} onPlan={setPlan} query={query} onQuery={setQuery} lunetaBtnRef={lunetaBtn} />

      <main id="conteudo" tabIndex={-1} className="outline-none">
        <div className="border-b border-nevoa/12 px-4 py-4 sm:px-6 lg:px-8">
          <h1 className="mb-3.5 font-display text-[13px] leading-none font-bold tracking-[-0.005em] text-luar">
            Leilões de imóveis <span className="font-medium text-nevoa">· área do assinante</span>
          </h1>
          <FilterBar plan={plan} filters={filters} count={results.length} onToggle={toggleFilter} onLocked={openUpsell} />
        </div>

        <div className="lg:grid lg:min-h-[calc(100svh-4rem)] lg:grid-cols-[minmax(0,1fr)_400px] 2xl:grid-cols-[minmax(0,1fr)_520px]">
          <div ref={listRef} className="flex min-w-0 flex-col gap-3 px-4 pt-4 pb-10 sm:px-6 sm:pt-6 lg:px-8 lg:pt-8">
            {lente && (
              <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-latao/45 bg-tinta p-4 transition-[opacity,translate] duration-300 ease-out starting:-translate-y-1 starting:opacity-0 sm:px-[18px]">
                <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-latao blur-[0.8px]">
                  <span className="size-[22px] rounded-full border-2 border-latao" />
                </span>
                <div className="min-w-[220px] flex-1">
                  <p className="font-display text-[15px] leading-snug font-bold">Você está no plano Lente: tags e selos ficam desfocados.</p>
                  <p className="mt-0.5 text-[13px] leading-normal text-nevoa">
                    Com a Luneta você vê os riscos de cada leilão, os selos Promissor, Na Mira e Alvo, favoritos e alerta de praça.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => upgrade("banner")}
                  className="btn-primary !min-h-11 !px-4 !text-[13px] [&_[data-placeholder]]:border-noite-fixa/50 [&_[data-placeholder]]:bg-noite-fixa/10 [&_[data-placeholder]]:text-noite-fixa"
                >
                  Assinar Luneta · <RichText text={`R$ ${LUNETA_PRICE}/mês`} />
                </button>
              </div>
            )}

            {results.length > 0 ? (
              <ul className="flex flex-col gap-3" aria-label="Exemplos fictícios de leilões, por maior deságio">
                {results.map((l) => (
                  <ListingRow
                    key={l.id}
                    listing={l}
                    plan={plan}
                    fav={!!favs[l.id]}
                    active={activeId === l.id}
                    onOpen={openDetail}
                    onHover={setHoverId}
                    onFav={toggleFav}
                    onLocked={openUpsell}
                  />
                ))}
              </ul>
            ) : (
              <div className="rounded-[18px] border border-dashed border-nevoa/35 px-6 py-10 text-center">
                <RingsIcon rings={2} size={28} className="mx-auto text-nevoa" />
                <p className="mt-3 font-display text-lg font-bold">Nenhum exemplo com esses filtros.</p>
                <p className="mx-auto mt-1 max-w-[42ch] text-sm leading-normal text-nevoa">
                  Tire um filtro ou mude a busca para abrir o foco da luneta.
                </p>
                <button type="button" onClick={clearAll} className="btn-ghost mt-5 !min-h-11 cursor-pointer !text-sm">
                  Limpar filtros e busca
                </button>
              </div>
            )}

            <p className="px-1 pt-2 text-xs leading-normal text-nevoa">
              Exemplos fictícios, só para demonstrar a área do assinante. Na versão publicada, a lista vem da base de leilões.
            </p>
          </div>

          <MapPanel results={results} plan={plan} activeId={activeId} onHover={setHoverId} onOpen={openDetail} />
        </div>

        <DetailDrawer
          open={openId !== null}
          listing={shown}
          openSeq={openSeq}
          plan={plan}
          fav={!!favs[shown.id]}
          openerRef={drawerOpener}
          onClose={closeDetail}
          onFav={toggleFav}
          onLocked={openUpsell}
          onUnlock={() => upgrade("drawer")}
        />
        <UpgradeModal open={upsellOpen} openerRef={modalOpener} onClose={closeUpsell} onUpgrade={() => upgrade("modal")} />

        <div role="status" aria-live="polite" aria-atomic="true" className="pointer-events-none fixed inset-x-0 bottom-5 z-[60] flex justify-center px-4">
          {toast && (
            <p
              key={toast.id}
              className={`flex max-w-[440px] items-center gap-2.5 rounded-2xl border border-latao/50 bg-tinta px-4 py-3 text-[13px] leading-snug text-luar shadow-[0_18px_50px_rgba(0,0,0,.35)] transition-[opacity,translate] duration-300 ease-out starting:translate-y-3 starting:opacity-0 ${
                toast.leaving ? "translate-y-2 opacity-0" : ""
              }`}
            >
              <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-latao shadow-[0_0_10px_#C9A24D]" />
              {toast.text}
            </p>
          )}
        </div>
      </main>
    </>
  );
}

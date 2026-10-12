"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { SUBSCRIBER_AREA } from "@/content/site";
import { POR_DENTRO as C, announceView, plural, type PlanView } from "@/content/por-dentro";
import { Title } from "@/components/ui/Heading";
import { LogoMark } from "@/components/ui/Logo";
import { createSweep, tally, type CardInfo, type Sweep, type Tally } from "./sweep";
import { ArrowIcon, ChipIcon, LockIcon, OppIcon, PointIcon, ReplayIcon, RiskIcon, SearchIcon } from "./icons";
import { PreviewGrid } from "./PreviewGrid";
// Estilos próprios da seção: CSS global com prefixo pd- (as animações dependem de seletores entre camadas).
import "./por-dentro.css";

const VIEWS: PlanView[] = ["lente", "luneta"];
/** Depois que a janela aparece, espera este tempo e troca sozinha para a Luneta. */
const AUTOPLAY_MS = 2200;
/** Pausa na Lente antes de rever a troca. */
const REPLAY_PAUSE_MS = 650;
/** Monta as cópias da varredura quando a lista está a esta distância da tela. */
const MOUNT_MARGIN = "900px 0px";

/** Media query reativa; no servidor assume o desktop (3 cartões). */
function useMedia(query: string, server: boolean) {
  const subscribe = useCallback(
    (cb: () => void) => {
      const m = matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => matchMedia(query).matches, () => server);
}

/** Dois conteúdos empilhados na mesma célula; o ativo entra com fade + deslize curto, sem pular a altura. */
function Swap({ active, className = "", children }: { active: boolean; className?: string; children: ReactNode }) {
  return (
    <div className={`pd-swap [grid-area:1/1] ${className}`} data-active={active || undefined} aria-hidden={!active || undefined} inert={!active}>
      {children}
    </div>
  );
}

/**
 * "Por dentro, depois de assinar": texto do plano + janela do app com a mesma lista nas visões
 * Lente (tags e selos desfocados) e Luneta. Ao trocar para a Luneta, uma luneta varre a lista uma vez
 * (ver sweep.ts); o texto troca junto e o contador de riscos e oportunidades ganha vida.
 * A cópia `lente` (base) chega pronta do servidor. As duas nítidas, a revelada e a vista por dentro da
 * luneta, só são montadas quando a lista se aproxima da tela: metade a menos de DOM para hidratar.
 */
export function PorDentro({ cards, lente }: { cards: CardInfo[]; lente: ReactNode }) {
  const [view, setView] = useState<PlanView>("lente");
  const [copies, setCopies] = useState(false);
  // camada exposta a leitores de tela: só muda quando a troca termina (não pesa no quadro do clique)
  const [layer, setLayer] = useState<PlanView>("lente");
  const [sweeping, setSweeping] = useState(false);
  const [counts, setCounts] = useState<Tally>({ risks: 0, opps: 0 });
  const [armed, setArmed] = useState(false);
  const [announce, setAnnounce] = useState("");

  const stage = useRef<HTMLDivElement>(null);
  const reveal = useRef<HTMLDivElement>(null);
  const revealInner = useRef<HTMLDivElement>(null);
  const band = useRef<HTMLDivElement>(null);
  const scope = useRef<HTMLDivElement>(null);
  const scopeInner = useRef<HTMLDivElement>(null);
  const tabs = useRef<Record<PlanView, HTMLButtonElement | null>>({ lente: null, luneta: null });
  const engine = useRef<Sweep | null>(null);
  /** Troca pedida antes de as cópias existirem (raro: seção alcançada antes do observador avisar). */
  const pending = useRef<{ to: PlanView; opts?: { instant?: boolean } } | null>(null);
  const auto = useRef({ done: false, timer: 0, replay: 0 });

  // 3 cartões a partir de 64rem (lg); 2 abaixo disso.
  const wide = useMedia("(min-width: 64rem)", true);
  const totals = useMemo(() => tally(cards, wide ? [0, 1, 2] : [0, 1]), [cards, wide]);
  const visible = wide ? 3 : 2;
  const shown = sweeping ? counts : totals;

  useEffect(() => {
    const d = {
      stage: stage.current,
      reveal: reveal.current,
      revealInner: revealInner.current,
      band: band.current,
      scope: scope.current,
      scopeInner: scopeInner.current,
    };
    if (!copies || !d.stage || !d.reveal || !d.revealInner || !d.band || !d.scope || !d.scopeInner) return;
    const sw = createSweep(
      { stage: d.stage, reveal: d.reveal, revealInner: d.revealInner, band: d.band, scope: d.scope, scopeInner: d.scopeInner },
      cards,
      {
        onStart: (to, animated) => {
          setSweeping(animated && to === "luneta");
          if (to === "luneta") setCounts({ risks: 0, opps: 0 });
        },
        onTag: (risk) => {
          if (risk) setCounts((c) => ({ ...c, risks: c.risks + 1 }));
        },
        onSeal: (opp) => {
          if (opp) setCounts((c) => ({ ...c, opps: c.opps + 1 }));
        },
        onDone: (to, t) => {
          setSweeping(false);
          setLayer(to);
          setAnnounce(announceView(to, t.risks, t.opps));
        },
      },
    );
    engine.current = sw;
    // Se a lista já está na tela quando as cópias chegam, deixa as camadas compostas para a troca.
    const r = d.stage.getBoundingClientRect();
    if (r.bottom > 0 && r.top < window.innerHeight) sw.prime(true);
    if (pending.current) {
      sw.play(pending.current.to, pending.current.opts);
      pending.current = null;
    }
    return () => {
      sw.destroy();
      engine.current = null;
    };
  }, [cards, copies]);

  useEffect(() => {
    const el = stage.current;
    if (!el || copies) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setCopies(true), { rootMargin: MOUNT_MARGIN });
    io.observe(el);
    return () => io.disconnect();
  }, [copies]);

  // A varredura começa já; o texto, as abas e o contador trocam no quadro seguinte (divide o trabalho do clique).
  const go = useCallback((to: PlanView, opts?: { instant?: boolean }) => {
    if (engine.current) engine.current.play(to, opts);
    else {
      pending.current = { to, opts };
      setCopies(true);
    }
    requestAnimationFrame(() => setView(to));
  }, []);

  // Autoplay: quando a lista aparece de verdade na tela (3/4 dela, ou 60% da altura da tela no celular,
  // onde ela é mais alta), mostra a Lente e troca sozinha para a Luneta.
  useEffect(() => {
    const el = stage.current;
    const a = auto.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      ([e]) => {
        engine.current?.prime(e.isIntersecting);
        if (a.done) return;
        const seen = e.isIntersecting && (e.intersectionRatio >= 0.74 || e.intersectionRect.height >= window.innerHeight * 0.6);
        if (seen) {
          if (a.timer) return;
          setArmed(true);
          a.timer = window.setTimeout(() => {
            a.timer = 0;
            a.done = true;
            setArmed(false);
            go("luneta");
          }, AUTOPLAY_MS);
        } else {
          clearTimeout(a.timer);
          a.timer = 0;
          setArmed(false);
        }
      },
      { threshold: [0, 0.25, 0.5, 0.6, 0.75, 0.9, 1] },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clearTimeout(a.timer);
      clearTimeout(a.replay);
      a.timer = 0;
    };
  }, [go]);

  /** Qualquer escolha de quem lê desliga o autoplay. */
  const takeOver = () => {
    const a = auto.current;
    a.done = true;
    clearTimeout(a.timer);
    clearTimeout(a.replay);
    a.timer = 0;
    setArmed(false);
  };

  const choose = (to: PlanView) => {
    takeOver();
    if (to !== view) go(to);
  };

  const replay = () => {
    takeOver();
    go("lente", { instant: true });
    auto.current.replay = window.setTimeout(() => go("luneta"), REPLAY_PAUSE_MS);
  };

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = VIEWS.indexOf(view);
    const next =
      e.key === "ArrowRight" || e.key === "ArrowLeft" ? VIEWS[(i + 1) % VIEWS.length] : e.key === "Home" ? "lente" : e.key === "End" ? "luneta" : null;
    if (!next) return;
    e.preventDefault();
    tabs.current[next]?.focus();
    choose(next);
  };

  const fromLenteCta = () => {
    choose("luneta");
    tabs.current.luneta?.focus();
  };

  const tabId = (v: PlanView) => `por-dentro-aba-${v}`;

  return (
    <div id="por-dentro" data-reveal className="mt-20 sm:mt-28">
      <p className="eyebrow mb-5">{C.eyebrow}</p>
      <h3 className="h2 max-w-[920px]">
        <Title parts={C.title} />
      </h3>
      <p className="mt-5 max-w-[600px] text-[17px] leading-relaxed text-nevoa">{C.lead}</p>

      {/* Lente | Luneta */}
      <div
        role="tablist"
        aria-label={C.tablistLabel}
        className="relative mt-9 grid w-full grid-cols-2 rounded-full border border-nevoa/25 bg-tinta p-1 sm:inline-grid sm:w-auto sm:mt-11"
      >
        <span aria-hidden="true" className="pd-thumb absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-latao" data-luneta={view === "luneta" || undefined} />
        {VIEWS.map((v) => {
          const on = view === v;
          return (
            <button
              key={v}
              ref={(el) => {
                tabs.current[v] = el;
              }}
              id={tabId(v)}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls="por-dentro-painel"
              tabIndex={on ? 0 : -1}
              onClick={() => choose(v)}
              onKeyDown={onTabKey}
              className={`relative z-10 flex min-h-14 flex-col items-center justify-center overflow-hidden rounded-full px-6 leading-none transition-colors duration-300 sm:min-w-[200px] ${
                on ? "text-noite-fixa" : "text-nevoa hover:text-luar"
              }`}
            >
              <span className="font-display text-[16px] font-bold tracking-[-0.01em]">{C[v].tab}</span>
              <span className={`mt-1 text-[12px] font-medium ${on ? "text-noite-fixa/80" : ""}`}>{C[v].hint}</span>
              {v === "luneta" && armed && <span aria-hidden="true" className="pd-arm absolute inset-x-7 bottom-1.5 h-0.5 rounded-full bg-latao" />}
            </button>
          );
        })}
      </div>

      {/* Painel de texto: os dois planos empilhados na mesma célula */}
      <div id="por-dentro-painel" role="tabpanel" aria-labelledby={tabId(view)} tabIndex={0} className="mt-9 grid rounded-2xl sm:mt-10">
        {VIEWS.map((v) => (
          <Swap key={v} active={view === v}>
            <PlanText view={v} onLenteCta={fromLenteCta} />
          </Swap>
        ))}
      </div>

      {/* Janela do app */}
      <figure className="pd-window relative mt-10 overflow-hidden rounded-3xl border border-latao/45 bg-noite sm:mt-12">
        <figcaption className="sr-only">{C.window.label}</figcaption>
        <div aria-hidden="true" className="flex items-center gap-3 border-b border-nevoa/15 px-4 py-3 sm:px-5">
          <span className="inline-flex items-center gap-2 font-display text-sm font-bold text-luar">
            <LogoMark size={18} />
            {C.window.app}
          </span>
          <span className="hidden min-w-0 flex-1 items-center gap-2 rounded-full border border-nevoa/20 bg-tinta px-3 py-1.5 text-xs text-nevoa sm:flex">
            <SearchIcon size={13} />
            <span className="truncate">{C.window.search}</span>
          </span>
          <span className="ml-auto grid justify-items-end">
            <Swap active={view === "lente"}>
              <span className="block rounded-full border border-nevoa/35 px-2.5 py-1 text-[11px] font-semibold tracking-[0.1em] whitespace-nowrap text-nevoa uppercase">
                {C.window.badge.lente}
              </span>
            </Swap>
            <Swap active={view === "luneta"}>
              <span className="block rounded-full border border-latao bg-latao px-2.5 py-1 text-[11px] font-semibold tracking-[0.1em] whitespace-nowrap text-noite-fixa uppercase">
                {C.window.badge.luneta}
              </span>
            </Swap>
          </span>
        </div>

        <div aria-hidden="true" className="flex flex-wrap items-center gap-x-2 gap-y-2.5 border-b border-nevoa/15 px-4 py-3 sm:px-5">
          <span className="mr-1 hidden text-[10px] font-semibold tracking-[0.14em] text-nevoa uppercase sm:inline">{C.window.filtersLabel}</span>
          {C.window.chips.map((c, i) => (
            <span
              key={c}
              className={`inline-flex items-center gap-1.5 rounded-full border border-latao/55 bg-latao/10 px-3 py-1.5 text-xs font-medium whitespace-nowrap text-luar ${
                i === 2 ? "max-xl:hidden" : ""
              }`}
            >
              <span className="text-latao-texto">
                <ChipIcon name={i as 0 | 1 | 2} />
              </span>
              {c}
            </span>
          ))}
          <span className="grid text-[13px] leading-none max-md:w-full max-md:pt-1 md:ml-auto">
            <Swap active={view === "lente"} className="flex items-center gap-2 whitespace-nowrap text-nevoa md:justify-end">
              <span className="font-semibold text-luar tabular-nums max-sm:hidden">
                {visible} {plural.exemplos(visible)}
              </span>
              <span className="text-nevoa/60 max-sm:hidden">·</span>
              <LockIcon size={13} />
              {C.window.locked}
            </Swap>
            <Swap active={view === "luneta"} className="flex items-center gap-x-2 gap-y-1 whitespace-nowrap md:justify-end">
              <span className="font-semibold text-luar tabular-nums max-sm:hidden">
                {visible} {plural.exemplos(visible)}
              </span>
              <span className="text-nevoa/60 max-sm:hidden">·</span>
              <span className="inline-flex items-center gap-1.5 font-medium text-grave-texto">
                <RiskIcon />
                <b key={`r${shown.risks}`} className="pd-bump font-display text-[15px] font-bold tabular-nums">
                  {shown.risks}
                </b>
                {plural.riscos(shown.risks)}
              </span>
              <span className="text-nevoa/60">·</span>
              <span className="inline-flex items-center gap-1.5 font-medium text-latao-texto">
                <OppIcon />
                <b key={`o${shown.opps}`} className="pd-bump font-display text-[15px] font-bold tabular-nums">
                  {shown.opps}
                </b>
                {plural.oportunidades(shown.opps)}
              </span>
            </Swap>
          </span>
        </div>

        <div ref={stage} className="pd-stage" data-mode="lente" data-phase="rest" data-axis="x">
          <div className="pd-base" aria-hidden={layer !== "lente" || undefined} inert={layer !== "lente"}>
            {lente}
          </div>
          <div ref={reveal} className="pd-reveal" aria-hidden={layer !== "luneta" || undefined} inert={layer !== "luneta"}>
            <div ref={revealInner} className="pd-reveal-inner pd-layer">
              {copies && <PreviewGrid locked={false} />}
            </div>
          </div>
          <div ref={band} className="pd-band" aria-hidden="true" />
          <div ref={scope} className="pd-scope" aria-hidden="true">
            <span className="pd-scope-glow" />
            <div className="pd-glass">
              <div ref={scopeInner} className="pd-scope-inner pd-layer" inert>
                {copies && <PreviewGrid locked={false} />}
              </div>
            </div>
            <svg className="pd-frame" viewBox="-60 -60 120 120">
              <circle r="58.5" fill="none" stroke="#C9A24D" strokeOpacity=".45" strokeWidth=".9" />
              <circle r="54.6" fill="none" stroke="#C9A24D" strokeWidth="3.4" />
              <g stroke="var(--luar)" strokeWidth="1.3" strokeLinecap="round">
                <path d="M0 -60.5v-6M0 60.5v6M-60.5 0h-6M60.5 0h6" />
                <path d="M0 -52.5v6M0 52.5v-6M-52.5 0h6M52.5 0h-6" strokeOpacity=".7" />
              </g>
            </svg>
          </div>
        </div>
      </figure>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
        <p className="max-w-[600px] text-[13px] leading-relaxed text-nevoa">{C.disclaimer}</p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={replay}
            className="inline-flex min-h-12 items-center gap-2 rounded-full px-4 text-sm font-medium text-nevoa transition-colors hover:text-luar motion-reduce:hidden"
          >
            <ReplayIcon />
            {C.replay}
          </button>
          <Link href={SUBSCRIBER_AREA.href} className="btn-outline">
            {C.demo}
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Texto de um plano: rótulo, título, apoio, pontos (2 × 2 no desktop) e chamada. */
function PlanText({ view, onLenteCta }: { view: PlanView; onLenteCta: () => void }) {
  const lente = view === "lente";
  const t = lente ? C.lente : C.luneta;
  return (
    <div className="grid gap-x-14 gap-y-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:grid-rows-[auto_1fr]">
      <div className="lg:col-start-1 lg:row-start-1">
        <p className="flex items-center gap-2.5 text-[12px] font-semibold tracking-[0.16em] text-latao-texto uppercase">
          <span aria-hidden="true" className="h-px w-6 bg-latao" />
          {t.kicker}
        </p>
        <h4 className="mt-4 font-display text-[clamp(26px,2.6vw,34px)] leading-[1.12] font-bold tracking-[-0.02em] text-balance">{t.headline}</h4>
        <p className="mt-4 max-w-[460px] text-[15.5px] leading-relaxed text-nevoa">{t.text}</p>
      </div>

      <ul className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center">
        {t.points.map((pt, i) => (
          <li key={pt.title} className="pd-point flex gap-4" style={{ ["--i" as string]: i }}>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full border-[1.5px] border-latao/80 text-latao-texto">
              <PointIcon name={pt.icon} />
            </span>
            <div>
              <p className="font-display text-[17px] leading-snug font-bold tracking-[-0.01em]">{pt.title}</p>
              <p className="mt-1 text-[14.5px] leading-relaxed text-nevoa">{pt.text}</p>
            </div>
          </li>
        ))}
        {lente && (
          <li className="pd-point flex gap-4" style={{ ["--i" as string]: 3 }}>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-nevoa/60 text-nevoa">
              <LockIcon size={18} />
            </span>
            <div>
              <p className="font-display text-[17px] leading-snug font-bold tracking-[-0.01em]">{C.lente.note.title}</p>
              <p className="mt-1 text-[14.5px] leading-relaxed text-nevoa">{C.lente.note.text}</p>
            </div>
          </li>
        )}
      </ul>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 lg:col-start-1 lg:row-start-2 lg:self-start">
        {lente ? (
          <button type="button" onClick={onLenteCta} className="btn-outline gap-2">
            {C.lente.cta}
            <ArrowIcon size={16} />
          </button>
        ) : (
          <>
            <a href={C.luneta.cta.href} className="btn-primary">
              {C.luneta.cta.label}
            </a>
            <span className="text-[13px] text-nevoa">{C.luneta.ctaNote}</span>
          </>
        )}
      </div>
    </div>
  );
}

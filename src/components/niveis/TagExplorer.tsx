"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { LEVELS } from "@/content/site";
import { SEVERITY_ORDER, TAG_CATEGORIES, type Severity } from "@/content/tags";
import { Tag } from "@/components/ui/Tag";
import { TagPopover, type OpenTag } from "./TagPopover";
import "./niveis.css";

const T = LEVELS.tags;

const SEVERITY_PLURAL: Record<Severity, [string, string]> = {
  grave: ["grave", "graves"],
  atencao: ["de atenção", "de atenção"],
  positivo: ["positiva", "positivas"],
  info: ["informativa", "informativas"],
};

/** Bolinhas do resumo: tons médios fixos, que se distinguem bem tanto no tema escuro quanto no claro. */
const DOT: Record<Severity, string> = {
  grave: "bg-[#E5484D]",
  atencao: "bg-[#D9A42B]",
  positivo: "bg-[#2BB67F]",
  info: "bg-[#8E9BB5]",
};

/** Resumo das gravidades de uma categoria: bolinhas na ordem grave → informativo + texto para leitores de tela. */
function summary(severities: Severity[]) {
  const sorted = [...severities].sort((a, b) => SEVERITY_ORDER.indexOf(a) - SEVERITY_ORDER.indexOf(b));
  const text = SEVERITY_ORDER.filter((s) => severities.includes(s))
    .map((s) => {
      const n = severities.filter((x) => x === s).length;
      return `${n} ${SEVERITY_PLURAL[s][n > 1 ? 1 : 0]}`;
    })
    .join(", ");
  return { sorted, text };
}

function TapIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.5 12V5.8a1.6 1.6 0 0 1 3.2 0V11" />
      <path d="M12.7 10.4a1.6 1.6 0 0 1 3.2 0v1.2" />
      <path d="M15.9 11.2a1.6 1.6 0 0 1 3.1.4v2.9a6.2 6.2 0 0 1-6.2 6.2h-.9a5.2 5.2 0 0 1-4.3-2.3l-2.4-3.6a1.6 1.6 0 0 1 2.6-1.9l1.5 1.7" />
      <path d="M6.6 6.2a5 5 0 0 1 8.9-.6" opacity=".55" />
    </svg>
  );
}

/**
 * As 8 categorias de tags como cartões que abrem (grid-template-rows 0fr → 1fr + tags em cascata).
 * Cada tag é um botão que abre um pop-up de explicação (TagPopover), só um por vez.
 * O primeiro cartão pulsa de leve, como convite, até o primeiro clique em qualquer categoria.
 */
export function TagExplorer() {
  const base = useId();
  const [open, setOpen] = useState<boolean[]>(() => TAG_CATEGORIES.map(() => false));
  // As tags de uma categoria só entram no DOM na primeira vez que ela abre (a página hidrata ~400 nós a menos).
  const [seen, setSeen] = useState<boolean[]>(() => TAG_CATEGORIES.map(() => false));
  const [bulk, setBulk] = useState(false);
  const [touched, setTouched] = useState(false);
  const [pop, setPopState] = useState<OpenTag | null>(null);
  const popRef = useRef<OpenTag | null>(null);
  const triggers = useRef(new Map<string, HTMLButtonElement>());
  const closeTimer = useRef<number | undefined>(undefined);
  const allOpen = open.every(Boolean);
  const dialogId = `${base}-explicacao`;
  const panelId = (ci: number) => `${base}-cat${ci}`;

  // Estado do pop-up também num ref, para os fechamentos vindos de eventos do documento lerem o valor atual.
  const setPop = useCallback((p: OpenTag | null) => {
    popRef.current = p;
    setPopState(p);
  }, []);

  const closePop = useCallback(
    (restoreFocus: boolean) => {
      const p = popRef.current;
      if (!p || p.closing) return;
      if (restoreFocus) triggers.current.get(p.key)?.focus({ preventScroll: true });
      setPop({ ...p, closing: true });
      window.clearTimeout(closeTimer.current);
      // tempo da animação de saída (niveis.css → nv-pop-out / nv-sheet-out)
      closeTimer.current = window.setTimeout(() => {
        if (popRef.current?.closing) setPop(null);
      }, 200);
    },
    [setPop],
  );

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const openTag = (ci: number, ti: number) => {
    const key = `${ci}-${ti}`;
    const p = popRef.current;
    if (p && p.key === key && !p.closing) {
      closePop(false);
      return;
    }
    window.clearTimeout(closeTimer.current);
    setPop({ key, ci, ti, closing: false });
  };

  const toggle = (ci: number) => {
    setTouched(true);
    setBulk(false);
    if (open[ci] && pop?.ci === ci) closePop(false);
    setOpen((o) => o.map((v, i) => (i === ci ? !v : v)));
    setSeen((s) => s.map((v, i) => v || i === ci));
  };

  const toggleAll = () => {
    setTouched(true);
    setBulk(true);
    if (allOpen && pop) closePop(false);
    setOpen((o) => o.map(() => !allOpen));
    if (!allOpen) setSeen((s) => s.map(() => true));
  };

  return (
    <div className="mt-10 sm:mt-12">
      <div
        data-reveal
        className="flex flex-col gap-3 rounded-2xl border border-latao/40 bg-latao/[0.07] p-3 pl-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:pl-5"
      >
        <p className="flex items-center gap-3 text-[15px] leading-snug font-semibold text-luar">
          <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full border border-latao/60 bg-noite text-latao-texto">
            <TapIcon />
          </span>
          {T.hint}
        </p>
        <button
          type="button"
          onClick={toggleAll}
          aria-expanded={allOpen}
          aria-controls={TAG_CATEGORIES.map((_, ci) => panelId(ci)).join(" ")}
          className="btn-outline !min-h-10 shrink-0 self-start !px-4 !text-[13px] sm:self-auto"
        >
          {allOpen ? T.closeAll : T.openAll}
        </button>
      </div>

      <ul className="mt-4 grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TAG_CATEGORIES.map((cat, ci) => {
          const isOpen = open[ci];
          const btn = `${base}-btn${ci}`;
          const { sorted, text } = summary(cat.tags.map((t) => t.severity));
          const invite = ci === 0 && !touched;
          return (
            <li key={cat.name} data-reveal className="min-w-0">
              <div
                data-open={isOpen}
                className={`nv-cat relative rounded-[18px] border bg-noite transition-[border-color,background-color] duration-300 ${
                  isOpen ? "border-latao/55" : "border-nevoa/20 hover:border-latao/45"
                }`}
                style={{ ["--cat-delay" as string]: bulk ? `${ci * 60}ms` : "0ms" } as CSSProperties}
              >
                {invite && <span aria-hidden="true" className="nv-invite pointer-events-none absolute -inset-px rounded-[inherit] border-[1.5px] border-latao" />}
                {invite && (
                  <span aria-hidden="true" className="absolute -top-2.5 left-4 z-[1] rounded-full bg-latao px-2.5 py-1 text-[10px] leading-none font-semibold text-noite-fixa shadow-[0_4px_14px_rgba(201,162,77,.35)]">
                    {T.start}
                  </span>
                )}
                <h4>
                  <button
                    id={btn}
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId(ci)}
                    onClick={() => toggle(ci)}
                    className="group/cat flex w-full items-start gap-3 rounded-[18px] p-4 text-left sm:p-5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <span className="text-[11px] font-semibold tracking-[0.16em] text-latao-texto uppercase">{cat.name}</span>
                        <span className="flex items-center gap-1.5 text-xs text-nevoa">
                          <span aria-hidden="true" className="flex gap-[3px]">
                            {sorted.map((s, i) => (
                              <span key={i} className={`size-[7px] rounded-full ${DOT[s]}`} />
                            ))}
                          </span>
                          {cat.tags.length} tags
                          <span className="sr-only">: {text}</span>
                        </span>
                      </span>
                      <span className="mt-1.5 block font-display text-[17px] leading-snug font-bold tracking-[-0.01em] text-luar">{cat.question}</span>
                    </span>
                    <span
                      aria-hidden="true"
                      className={`nv-plus flex size-8 shrink-0 items-center justify-center rounded-full border font-display text-lg leading-none transition-[transform,background-color,border-color,color] duration-300 ${
                        isOpen
                          ? "rotate-45 border-latao bg-latao text-noite-fixa"
                          : "border-latao/60 text-latao-texto group-hover/cat:border-latao group-hover/cat:bg-latao/10"
                      }`}
                    >
                      +
                    </span>
                  </button>
                </h4>
                <div id={panelId(ci)} className="nv-panel grid">
                  <div className="min-h-0 overflow-hidden" inert={!isOpen}>
                    <ul className="mx-3 border-t border-nevoa/15 pt-2 pb-3 sm:mx-4">
                      {seen[ci] && cat.tags.map((t, ti) => {
                        const key = `${ci}-${ti}`;
                        const active = pop?.key === key && !pop.closing;
                        return (
                          <li key={t.label} className="nv-tag-item" style={{ ["--i" as string]: ti } as CSSProperties}>
                            <button
                              ref={(el) => {
                                if (el) triggers.current.set(key, el);
                                else triggers.current.delete(key);
                              }}
                              type="button"
                              aria-haspopup="dialog"
                              aria-expanded={active}
                              aria-controls={active ? dialogId : undefined}
                              onClick={() => openTag(ci, ti)}
                              className={`group/tag -mx-1 flex w-[calc(100%+8px)] items-center justify-between gap-3 rounded-xl px-1 py-1.5 text-left transition-colors hover:bg-nevoa/[0.08] ${
                                active ? "bg-nevoa/[0.1]" : ""
                              }`}
                            >
                              <Tag label={t.label} severity={t.severity} className="!whitespace-normal !leading-[1.2]" />
                              <span className="sr-only">, ver explicação</span>
                              <span
                                aria-hidden="true"
                                className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold transition-colors ${
                                  active
                                    ? "border-latao bg-latao text-noite-fixa"
                                    : "border-nevoa/35 text-nevoa group-hover/tag:border-latao group-hover/tag:text-latao-texto"
                                }`}
                              >
                                ?
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {pop && (
        <TagPopover
          id={dialogId}
          open={pop}
          category={TAG_CATEGORIES[pop.ci].name}
          tag={TAG_CATEGORIES[pop.ci].tags[pop.ti]}
          getTrigger={() => triggers.current.get(pop.key) ?? null}
          onClose={closePop}
        />
      )}
    </div>
  );
}

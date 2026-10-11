"use client";

import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { LEVELS } from "@/content/site";
import { SEVERITY_LABEL, type TagDef } from "@/content/tags";
import { Seal } from "@/components/ui/Seal";
import { SEVERITY_TONE, SeverityIcon } from "./severity";
import "./niveis.css";

const T = LEVELS.tags;

export type OpenTag = { key: string; ci: number; ti: number; closing: boolean };

/** No celular o pop-up vira uma folha que sobe de baixo. */
const SHEET_QUERY = "(max-width: 639px)";
function subscribeSheet(cb: () => void) {
  const mq = window.matchMedia(SHEET_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const useSheet = () =>
  useSyncExternalStore(
    subscribeSheet,
    () => window.matchMedia(SHEET_QUERY).matches,
    () => false,
  );

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Pop-up de explicação de uma tag: nome, gravidade (ícone + texto), "O que é" e "Na prática".
 * Ancorado na tag (abaixo dela, ou acima se faltar espaço); no celular, folha que sobe de baixo.
 * Esc, o botão de fechar e clique fora fecham e devolvem o foco para a tag. Tab no fim do pop-up
 * (ou Shift+Tab no começo) fecha e volta para a tag, para a navegação seguir de onde estava.
 * Fica num portal no <body> para não ser cortado pelo acordeão (overflow: hidden).
 */
export function TagPopover({
  id,
  open,
  category,
  tag,
  getTrigger,
  onClose,
}: {
  id: string;
  open: OpenTag;
  category: string;
  tag: TagDef;
  getTrigger: () => HTMLElement | null;
  onClose: (restoreFocus: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const sheet = useSheet();
  const tone = SEVERITY_TONE[tag.severity];
  const titleId = `${id}-titulo`;
  const bodyId = `${id}-texto`;
  const latest = useRef({ getTrigger, onClose });
  useEffect(() => {
    latest.current = { getTrigger, onClose };
  });

  // Posição: medida antes da pintura, ao abrir, ao trocar de tag e ao redimensionar.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || sheet) return;
    const place = () => {
      const trigger = latest.current.getTrigger();
      if (!trigger) return;
      const r = trigger.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const m = 16;
      const left = Math.min(Math.max(r.left - 4, m), vw - w - m);
      const fitsBelow = r.bottom + 12 + h <= window.innerHeight - m;
      const fitsAbove = r.top - 12 - h >= 72; // abaixo da barra fixa do topo
      const below = fitsBelow || !fitsAbove;
      const top = below ? r.bottom + 12 : r.top - 12 - h;
      const ax = Math.min(Math.max(r.left + 18 - left, 18), w - 18);
      el.dataset.place = below ? "below" : "above";
      el.style.setProperty("--top", `${Math.round(top + window.scrollY)}px`);
      el.style.setProperty("--left", `${Math.round(left + window.scrollX)}px`);
      el.style.setProperty("--ax", `${Math.round(ax)}px`);
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open.key, sheet]);

  // Foco no pop-up ao abrir (sem rolar a página).
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, [open.key]);

  // Esc e clique fora.
  useEffect(() => {
    if (open.closing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      latest.current.onClose(true);
    };
    const onPointer = (e: PointerEvent) => {
      const el = ref.current;
      const target = e.target as Node | null;
      const trigger = latest.current.getTrigger();
      if (!el || !target || el.contains(target) || trigger?.contains(target)) return;
      latest.current.onClose(false);
      // Clique em área sem foco (texto, fundo): o foco volta para a tag.
      window.setTimeout(() => {
        const a = document.activeElement;
        if (!a || a === document.body || el.contains(a)) latest.current.getTrigger()?.focus({ preventScroll: true });
      }, 0);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer, true);
    };
  }, [open.closing, open.key]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const el = ref.current;
    if (!el) return;
    const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = items[0];
    const last = items[items.length - 1];
    const a = document.activeElement;
    if ((e.shiftKey && (a === el || a === first)) || (!e.shiftKey && a === last)) {
      e.preventDefault();
      onClose(true);
    }
  };

  const state = open.closing ? "closed" : "open";

  return createPortal(
    <>
      {sheet && <div aria-hidden="true" data-state={state} className="nv-backdrop" />}
      <div
        key={open.key}
        ref={ref}
        id={id}
        role="dialog"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        data-state={state}
        data-mode={sheet ? "sheet" : "pop"}
        onKeyDown={onKeyDown}
        className={`nv-pop rounded-[20px] border bg-tinta p-5 text-left text-luar shadow-[0_24px_70px_rgba(7,11,22,.45)] outline-none ${tone.border}`}
      >
        <span aria-hidden="true" className="nv-arrow" />
        <span aria-hidden="true" className="nv-handle mx-auto mb-4 h-1 w-10 rounded-full bg-nevoa/40" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={`flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.14em] uppercase ${tone.text}`}>
              <span className={`flex size-5 items-center justify-center rounded-full border ${tone.border} ${tone.bg}`}>
                <SeverityIcon severity={tag.severity} size={11} />
              </span>
              {SEVERITY_LABEL[tag.severity]}
              <span className="text-nevoa">· {category}</span>
            </p>
            <h2 id={titleId} className="mt-2.5 font-display text-[21px] leading-tight font-bold tracking-[-0.01em]">
              {tag.label}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onClose(true)}
            aria-label="Fechar explicação"
            className="-mt-1.5 -mr-1.5 flex size-10 shrink-0 items-center justify-center rounded-full text-nevoa transition-colors hover:bg-nevoa/10 hover:text-luar"
          >
            <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
        <div id={bodyId}>
          <p className="mt-4 text-[11px] font-semibold tracking-[0.14em] text-nevoa uppercase">{T.what}</p>
          <p className="mt-1.5 text-[14px] leading-relaxed">{tag.what}</p>
          <div className={`mt-4 border-l-2 pl-3 ${tone.border}`}>
            <p className="text-[11px] font-semibold tracking-[0.14em] text-nevoa uppercase">{T.practice}</p>
            <p className="mt-1.5 text-[14px] leading-relaxed">{tag.practice}</p>
          </div>
        </div>
        <p className="mt-4 flex items-start gap-2.5 border-t border-nevoa/15 pt-3.5 text-[13px] leading-snug text-nevoa">
          <Seal level={2} size={16} className="mt-px" />
          <span>
            {T.footer}{" "}
            <a href="#planos" onClick={() => onClose(false)} className="font-semibold whitespace-nowrap text-latao-texto underline decoration-latao/50 underline-offset-[3px] hover:text-luar">
              Ver planos
            </a>
          </span>
        </p>
      </div>
    </>,
    document.body,
  );
}

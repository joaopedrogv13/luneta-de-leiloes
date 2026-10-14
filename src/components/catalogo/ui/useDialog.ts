"use client";

import { useEffect, useRef, type RefObject } from "react";

/** Diálogos abertos, do mais antigo ao mais recente: só o do topo responde a Esc e Tab. */
const openStack: HTMLElement[] = [];
let scrollLocks = 0;

function lockScroll() {
  if (scrollLocks++ > 0) return;
  const gap = window.innerWidth - document.documentElement.clientWidth;
  document.documentElement.style.overflow = "hidden";
  // compensa a barra de rolagem que some, para a página não "pular" para o lado
  if (gap > 0) document.body.style.paddingRight = `${gap}px`;
}

function unlockScroll() {
  if (--scrollLocks > 0) return;
  document.documentElement.style.overflow = "";
  document.body.style.paddingRight = "";
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getClientRects().length > 0 && !el.closest("[inert]"),
  );
}

const isShown = (el: HTMLElement | null): el is HTMLElement => !!el && el.isConnected && el.getClientRects().length > 0;

/**
 * Comportamento de diálogo modal (drawer de detalhe e modal de upgrade):
 * foco vai para dentro ao abrir, Tab fica preso dentro, Esc fecha, o scroll do body trava
 * e, ao fechar, o foco volta para quem abriu (ou para `fallbackFocus`, se esse elemento sumiu).
 */
export function useDialog({
  open,
  dialogRef,
  onClose,
  initialFocusRef,
  openerRef,
  fallbackFocus,
}: {
  open: boolean;
  dialogRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** quem abriu o diálogo (no Safari o clique não foca o botão, então guardamos explicitamente) */
  openerRef?: RefObject<HTMLElement | null>;
  fallbackFocus?: () => HTMLElement | null;
}) {
  const latest = useRef({ onClose, fallbackFocus });
  useEffect(() => {
    latest.current = { onClose, fallbackFocus };
  });

  useEffect(() => {
    const el = dialogRef.current;
    if (!open || !el) return;

    const active = document.activeElement;
    const opener = openerRef?.current ?? (active instanceof HTMLElement && active !== document.body ? active : null);
    openStack.push(el);
    lockScroll();
    (initialFocusRef?.current ?? el).focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (openStack[openStack.length - 1] !== el) return;
      if (e.key === "Escape") {
        e.preventDefault();
        latest.current.onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables(el);
      if (items.length === 0) {
        e.preventDefault();
        el.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      if (e.shiftKey && (current === first || current === el || !el.contains(current))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (current === last || !el.contains(current))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      openStack.splice(openStack.indexOf(el), 1);
      unlockScroll();
      const target = isShown(opener) ? opener : latest.current.fallbackFocus?.();
      target?.focus({ preventScroll: true });
    };
    // Só reage a abrir/fechar; refs e callbacks são lidos na hora.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}

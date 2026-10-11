"use client";

import { useSyncExternalStore } from "react";

type Theme = "dark" | "light";

const listeners = new Set<() => void>();
const read = (): Theme => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function setTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem("luneta-theme", t);
  } catch {
    /* modo privado: segue sem persistir */
  }
  listeners.forEach((l) => l());
}

/** Alterna tema claro/escuro (persistido). O disco gira 180° ao alternar. */
export function ThemeToggle() {
  const theme = useSyncExternalStore<Theme>(subscribe, read, () => "dark");
  const next: Theme = theme === "light" ? "dark" : "light";
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={theme === "light" ? "Ativar tema escuro" : "Ativar tema claro"}
      className="inline-flex h-10 items-center gap-2 rounded-full border border-nevoa/40 px-3 text-[13px] font-medium text-nevoa transition-colors hover:border-latao hover:text-luar"
    >
      <span
        aria-hidden="true"
        className={`size-3.5 rounded-full border-[1.5px] border-current transition-transform duration-500 ${
          theme === "light" ? "rotate-180 bg-[linear-gradient(90deg,currentColor_50%,transparent_50%)]" : "bg-[linear-gradient(90deg,transparent_50%,currentColor_50%)]"
        }`}
      />
      <span className="hidden sm:inline">{theme === "light" ? "Escuro" : "Claro"}</span>
    </button>
  );
}

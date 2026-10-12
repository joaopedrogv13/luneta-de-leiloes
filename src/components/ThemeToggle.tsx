"use client";

import { useEffect, useId, useState, useSyncExternalStore } from "react";
import styles from "./ThemeToggle.module.css";

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

const RAYS = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4);

/**
 * Alterna tema claro/escuro (persistido). O ícone mostra para onde o clique leva: no tema escuro, o sol
 * ("Claro"); no claro, a lua ("Escuro"). Ao alternar, ele se transforma suavemente de um no outro.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore<Theme>(subscribe, read, () => "dark");
  const next: Theme = theme === "light" ? "dark" : "light";
  const showSun = next === "light";
  const maskId = `lua-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  // Só anima depois da primeira pintura, para o ajuste do tema salvo (hidratação) não virar animação.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={theme === "light" ? "Ativar tema escuro" : "Ativar tema claro"}
      className={`${styles.button} inline-flex h-10 pointer-coarse:h-11 items-center gap-2 rounded-full border border-nevoa/40 px-3 text-[13px] font-medium text-nevoa transition-colors hover:border-latao hover:text-luar`}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={`${styles.icon} ${showSun ? styles.sun : styles.moon} ${ready ? "" : styles.still}`}
      >
        <mask id={maskId}>
          <rect x="-2" y="-2" width="28" height="28" fill="white" />
          <circle className={styles.bite} cx="17" cy="7.5" r="7" fill="black" />
        </mask>
        <circle className={styles.core} cx="12" cy="12" r="8.5" fill="currentColor" mask={`url(#${maskId})`} />
        <g className={styles.rays} stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          {RAYS.map((a) => (
            <line
              key={a}
              x1={12 + Math.cos(a) * 7.6}
              y1={12 + Math.sin(a) * 7.6}
              x2={12 + Math.cos(a) * 10.2}
              y2={12 + Math.sin(a) * 10.2}
            />
          ))}
        </g>
      </svg>
      <span className="hidden sm:inline">{showSun ? "Claro" : "Escuro"}</span>
    </button>
  );
}

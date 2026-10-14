/**
 * Ícones de linha fina do catálogo (traço 1,6–1,8, cantos redondos, cor do texto). Decorativos:
 * o nome acessível vem sempre do texto ao lado ou do aria-label do botão.
 */
import type { Severidade } from "@/lib/catalogo/tipos";

type P = { className?: string; tamanho?: number };

const base = (tamanho: number) =>
  ({
    width: tamanho,
    height: tamanho,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
  }) as const;

export function IconeLupa({ className = "", tamanho = 18 }: P) {
  return (
    <svg {...base(tamanho)} viewBox="0 0 20 20" className={`shrink-0 ${className}`}>
      <circle cx="8.6" cy="8.6" r="5.6" />
      <path d="M12.8 12.8 17 17" />
    </svg>
  );
}

export function IconeX({ className = "", tamanho = 14 }: P) {
  return (
    <svg {...base(tamanho)} viewBox="0 0 14 14" className={`shrink-0 ${className}`}>
      <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" />
    </svg>
  );
}

export function IconeSeta({ className = "", tamanho = 12 }: P) {
  return (
    <svg {...base(tamanho)} viewBox="0 0 12 12" className={`shrink-0 ${className}`}>
      <path d="M2.5 4.5 6 8l3.5-3.5" />
    </svg>
  );
}

export function IconeCheck({ className = "", tamanho = 12 }: P) {
  return (
    <svg {...base(tamanho)} strokeWidth={2} viewBox="0 0 12 12" className={`shrink-0 ${className}`}>
      <path d="M2.4 6.3 4.9 8.7 9.7 3.6" />
    </svg>
  );
}

export function IconeCadeado({ className = "", tamanho = 14 }: P) {
  return (
    <svg {...base(tamanho)} strokeWidth={1.6} viewBox="0 0 14 14" className={`shrink-0 ${className}`}>
      <rect x="2.5" y="6.2" width="9" height="6.3" rx="1.6" />
      <path d="M4.6 6.2V4.4a2.4 2.4 0 0 1 4.8 0v1.8" />
    </svg>
  );
}

/** Três trilhos com cursores: "filtros". */
export function IconeAjustes({ className = "", tamanho = 18 }: P) {
  return (
    <svg {...base(tamanho)} viewBox="0 0 20 20" className={`shrink-0 ${className}`}>
      <path d="M3 5.5h8M15 5.5h2M3 10h2M9 10h8M3 14.5h6M13 14.5h4" />
      <circle cx="13" cy="5.5" r="2" />
      <circle cx="7" cy="10" r="2" />
      <circle cx="11" cy="14.5" r="2" />
    </svg>
  );
}

/** Setas para cima e para baixo: "ordenar". */
export function IconeOrdenar({ className = "", tamanho = 16 }: P) {
  return (
    <svg {...base(tamanho)} viewBox="0 0 16 16" className={`shrink-0 ${className}`}>
      <path d="M5 13V3M2.5 5.5 5 3l2.5 2.5M11 3v10M8.5 10.5 11 13l2.5-2.5" />
    </svg>
  );
}

export function IconePino({ className = "", tamanho = 16 }: P) {
  return (
    <svg {...base(tamanho)} viewBox="0 0 16 16" className={`shrink-0 ${className}`}>
      <path d="M8 14.5s4.5-4.3 4.5-8a4.5 4.5 0 0 0-9 0c0 3.7 4.5 8 4.5 8Z" />
      <circle cx="8" cy="6.5" r="1.6" />
    </svg>
  );
}

export function IconeMapa({ className = "", tamanho = 16 }: P) {
  return (
    <svg {...base(tamanho)} viewBox="0 0 16 16" className={`shrink-0 ${className}`}>
      <path d="M1.8 3.8 5.6 2.3l4.8 1.5 3.8-1.5v9.9l-3.8 1.5-4.8-1.5-3.8 1.5Z" />
      <path d="M5.6 2.3v9.9M10.4 3.8v9.9" />
    </svg>
  );
}

export function IconeCalendario({ className = "", tamanho = 16 }: P) {
  return (
    <svg {...base(tamanho)} viewBox="0 0 16 16" className={`shrink-0 ${className}`}>
      <rect x="2" y="3.2" width="12" height="10.8" rx="2" />
      <path d="M2 6.6h12M5.2 1.8v2.6M10.8 1.8v2.6" />
    </svg>
  );
}

/** Anéis concêntricos: selo / Luneta. */
export function IconeAneis({ className = "", tamanho = 14 }: P) {
  return (
    <svg {...base(tamanho)} strokeWidth={1.5} viewBox="0 0 14 14" className={`shrink-0 ${className}`}>
      <circle cx="7" cy="7" r="6" />
      <circle cx="7" cy="7" r="3" />
    </svg>
  );
}

/** ✕ grave, ! atenção, ✓ positivo, i informativo (mesmo desenho da Tag). */
export function IconeSeveridade({ severidade, className = "", tamanho = 12 }: P & { severidade: Severidade }) {
  const props = { ...base(tamanho), strokeWidth: 1.8, viewBox: "0 0 12 12", className: `shrink-0 ${className}` };
  switch (severidade) {
    case "grave":
      return (
        <svg {...props}>
          <path d="M3 3l6 6M9 3l-6 6" />
        </svg>
      );
    case "atencao":
      return (
        <svg {...props}>
          <path d="M6 1.8v5.4" />
          <circle cx="6" cy="10" r="0.6" fill="currentColor" />
        </svg>
      );
    case "positivo":
      return (
        <svg {...props}>
          <path d="M2.3 6.3l2.4 2.4 5-5.2" />
        </svg>
      );
    case "info":
      return (
        <svg {...props}>
          <circle cx="6" cy="2.6" r="0.6" fill="currentColor" />
          <path d="M6 5.2v5" />
        </svg>
      );
  }
}

/** Círculo girando (carregando). Some com "reduzir movimento" (fica um anel parado). */
export function Girando({ className = "", tamanho = 14 }: P) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 16 16" aria-hidden="true" className={`shrink-0 animate-spin motion-reduce:animate-none ${className}`}>
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

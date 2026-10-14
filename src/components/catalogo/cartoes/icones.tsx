/**
 * Ícones de linha fina dos cartões (16px, traço 1.5, cor do texto). Sempre decorativos: o texto ao lado
 * (visível ou só para leitor de tela) diz o que cada um é.
 */
import type { ReactNode } from "react";

type P = { className?: string; size?: number };

function Svg({ className = "", size = 16, children, viewBox = "0 0 16 16" }: P & { children: ReactNode; viewBox?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      {children}
    </svg>
  );
}

/** Área: os cantos de uma planta. */
export const IconeArea = (p: P) => (
  <Svg {...p}>
    <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />
    <path d="M5.5 10.5l5-5" opacity=".55" />
  </Svg>
);

export const IconeQuarto = (p: P) => (
  <Svg {...p}>
    <path d="M1.75 12.5V4.25M1.75 9.25h12.5v3.25M14.25 9.25V8a1.75 1.75 0 0 0-1.75-1.75H7.25v3" />
    <circle cx="4.4" cy="7.4" r="1.15" />
  </Svg>
);

export const IconeVaga = (p: P) => (
  <Svg {...p}>
    <path d="M2.5 11.25V8.5l1.4-3.4a1 1 0 0 1 .93-.6h6.34a1 1 0 0 1 .93.6l1.4 3.4v2.75H2.5z" />
    <path d="M2.5 8.5h11M4.25 11.25v1.5M11.75 11.25v1.5" />
    <circle cx="5" cy="9.9" r=".2" fill="currentColor" />
    <circle cx="11" cy="9.9" r=".2" fill="currentColor" />
  </Svg>
);

/** R$/m²: régua. */
export const IconeRegua = (p: P) => (
  <Svg {...p}>
    <path d="M1.9 10.6l8.7-8.7 3.5 3.5-8.7 8.7z" />
    <path d="M5.1 7.4l1.3 1.3M7 5.5l1.8 1.8M8.9 3.6l1.3 1.3" />
  </Svg>
);

export const IconeLocal = (p: P) => (
  <Svg {...p}>
    <path d="M8 14.25s4.75-4.3 4.75-7.75a4.75 4.75 0 0 0-9.5 0C3.25 9.95 8 14.25 8 14.25z" />
    <circle cx="8" cy="6.5" r="1.6" />
  </Svg>
);

export const IconeCalendario = (p: P) => (
  <Svg {...p}>
    <rect x="2.25" y="3.25" width="11.5" height="10.5" rx="2" />
    <path d="M2.25 6.75h11.5M5.5 1.75v3M10.5 1.75v3" />
  </Svg>
);

export const IconeCamera = (p: P) => (
  <Svg {...p}>
    <path d="M2 5.75A1.75 1.75 0 0 1 3.75 4h1.1l1-1.5h4.3l1 1.5h1.1A1.75 1.75 0 0 1 14 5.75v5.5A1.75 1.75 0 0 1 12.25 13h-8.5A1.75 1.75 0 0 1 2 11.25z" />
    <circle cx="8" cy="8.25" r="2.4" />
  </Svg>
);

export const IconeCadeado = (p: P) => (
  <Svg {...p} viewBox="0 0 14 14">
    <rect x="2.5" y="6.2" width="9" height="6.3" rx="1.6" />
    <path d="M4.6 6.2V4.4a2.4 2.4 0 0 1 4.8 0v1.8" />
  </Svg>
);

export const IconeCoracao = ({ cheio = false, ...p }: P & { cheio?: boolean }) => (
  <Svg {...p}>
    <path
      d="M8 13.5S2 10.1 2 5.9A3.15 3.15 0 0 1 8 4.4a3.15 3.15 0 0 1 6 1.5c0 4.2-6 7.6-6 7.6z"
      fill={cheio ? "currentColor" : "none"}
    />
  </Svg>
);

export const IconeLista = (p: P) => (
  <Svg {...p}>
    <rect x="1.75" y="2.75" width="4.5" height="4" rx="1" />
    <rect x="1.75" y="9.25" width="4.5" height="4" rx="1" />
    <path d="M8.5 4h5.75M8.5 6h3.5M8.5 10.5h5.75M8.5 12.5h3.5" />
  </Svg>
);

export const IconeGrade = (p: P) => (
  <Svg {...p}>
    <rect x="1.75" y="1.75" width="5.25" height="5.25" rx="1.25" />
    <rect x="9" y="1.75" width="5.25" height="5.25" rx="1.25" />
    <rect x="1.75" y="9" width="5.25" height="5.25" rx="1.25" />
    <rect x="9" y="9" width="5.25" height="5.25" rx="1.25" />
  </Svg>
);

export const IconeMapa = (p: P) => (
  <Svg {...p}>
    <path d="M1.75 3.9v9.35l4.1-1.75 4.3 1.75 4.1-1.75V2.15l-4.1 1.75-4.3-1.75z" />
    <path d="M5.85 2.15v9.35M10.15 3.9v9.35" />
  </Svg>
);

export const IconeSeta = (p: P) => (
  <Svg {...p}>
    <path d="M3 8h10M9 4l4 4-4 4" />
  </Svg>
);

export const IconeFechar = (p: P) => (
  <Svg {...p}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </Svg>
);

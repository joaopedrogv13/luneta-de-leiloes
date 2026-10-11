import type { ReactNode } from "react";
import type { PointIcon as PointIconName } from "@/content/por-dentro";

/** Ícones de linha fina da seção "Por dentro" (sempre decorativos: o texto vem ao lado). */
function Svg({ size = 20, children, className = "" }: { size?: number; children: ReactNode; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      {children}
    </svg>
  );
}

const POINTS: Record<PointIconName, ReactNode> = {
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.1 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.1-3.6-8.5S9.6 5.8 12 3.5z" />
    </>
  ),
  filter: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  scan: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.4 15.4L20 20M7.8 10.6l1.9 1.9 3.4-3.6" />
    </>
  ),
  tag: (
    <>
      <path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1 1 0 0 1 0 1.4l-7.3 7.3a1 1 0 0 1-1.4 0z" />
      <circle cx="8" cy="8" r="1.3" />
    </>
  ),
  rings: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z" />
      <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
    </>
  ),
};

export function PointIcon({ name, size = 20 }: { name: PointIconName; size?: number }) {
  return <Svg size={size}>{POINTS[name]}</Svg>;
}

export function LockIcon({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      <rect x="5" y="10.5" width="14" height="10" rx="2.4" />
      <path d="M8.2 10.5V7.8a3.8 3.8 0 0 1 7.6 0v2.7" />
    </Svg>
  );
}

export function SearchIcon({ size = 14 }: { size?: number }) {
  return (
    <Svg size={size}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5L20 20" />
    </Svg>
  );
}

export function ReplayIcon({ size = 16 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
      <path d="M4.5 3.8v4.6h4.6" />
    </Svg>
  );
}

export function ArrowIcon({ size = 16 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Svg>
  );
}

/** Ícones dos chips de filtro da janela (Brasil inteiro, deságio, ordem). */
export function ChipIcon({ name }: { name: 0 | 1 | 2 }) {
  return (
    <Svg size={13}>
      {name === 0 && (
        <>
          <path d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11z" />
          <circle cx="12" cy="10" r="2.3" />
        </>
      )}
      {name === 1 && (
        <>
          <path d="M18 6L6 18" />
          <circle cx="7.5" cy="7.5" r="2.3" />
          <circle cx="16.5" cy="16.5" r="2.3" />
        </>
      )}
      {name === 2 && <path d="M8 5v14M4.5 15.5L8 19l3.5-3.5M16 19V5M12.5 8.5L16 5l3.5 3.5" />}
    </Svg>
  );
}

/** ✕ de risco e anéis de oportunidade, no contador da janela. */
export function RiskIcon() {
  return (
    <Svg size={13} className="[stroke-width:2.2]">
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </Svg>
  );
}

export function OppIcon() {
  return (
    <Svg size={14}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4.6" />
    </Svg>
  );
}

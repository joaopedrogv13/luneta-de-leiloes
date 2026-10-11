import type { Severity } from "@/content/tags";

/** Cor de texto, borda e fundo por gravidade (os mesmos papéis da Tag). */
export const SEVERITY_TONE: Record<Severity, { text: string; border: string; bg: string; dot: string }> = {
  grave: { text: "text-grave-texto", border: "border-grave/55", bg: "bg-grave/12", dot: "bg-grave" },
  atencao: { text: "text-aten", border: "border-aten/50", bg: "bg-aten/10", dot: "bg-aten" },
  positivo: { text: "text-pos", border: "border-pos/50", bg: "bg-pos/10", dot: "bg-pos" },
  info: { text: "text-nevoa", border: "border-nevoa/50", bg: "bg-nevoa/10", dot: "bg-nevoa" },
};

/** Mesmos ícones de linha fina da Tag: ✕ grave, ! atenção, ✓ positivo, i informativo. */
export function SeverityIcon({ severity, size = 12, className = "" }: { severity: Severity; size?: number; className?: string }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 12 12",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    "aria-hidden": true,
    className: `shrink-0 ${className}`,
  };
  switch (severity) {
    case "grave":
      return (
        <svg {...common}>
          <path d="M3 3l6 6M9 3l-6 6" />
        </svg>
      );
    case "atencao":
      return (
        <svg {...common}>
          <path d="M6 1.8v5.4" />
          <circle cx="6" cy="10" r="0.6" fill="currentColor" />
        </svg>
      );
    case "positivo":
      return (
        <svg {...common}>
          <path d="M2.3 6.3l2.4 2.4 5-5.2" strokeLinejoin="round" />
        </svg>
      );
    case "info":
      return (
        <svg {...common}>
          <circle cx="6" cy="2.6" r="0.6" fill="currentColor" />
          <path d="M6 5.2v5" />
        </svg>
      );
  }
}

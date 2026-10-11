import { SEVERITY_LABEL, type Severity } from "@/content/tags";

const STYLES: Record<Severity, string> = {
  grave: "border-grave/55 bg-grave/12 text-grave-texto",
  atencao: "border-aten/50 bg-aten/10 text-aten",
  positivo: "border-pos/50 bg-pos/10 text-pos",
  info: "border-nevoa/50 bg-nevoa/10 text-nevoa",
};

/** Ícones de linha fina: ✕ grave, ! atenção, ✓ positivo, i informativo. */
function TagIcon({ severity }: { severity: Severity }) {
  const common = { width: 12, height: 12, viewBox: "0 0 12 12", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, "aria-hidden": true };
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

/**
 * Tag de risco: cor por gravidade, sempre com ícone e texto. A gravidade também vai para leitores
 * de tela (texto oculto), para não depender só da cor.
 */
export function Tag({ label, severity, className = "" }: { label: string; severity: Severity; className?: string }) {
  return (
    <span
      data-tag
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs leading-none font-medium whitespace-nowrap ${STYLES[severity]} ${className}`}
    >
      <TagIcon severity={severity} />
      <span className="sr-only">{SEVERITY_LABEL[severity]}: </span>
      {label}
    </span>
  );
}

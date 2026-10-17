/**
 * Ícones do relatório (SVG em linha, sem estado: servem ao servidor e ao navegador). Traço em currentColor, para
 * a impressão em preto e branco; o sentido nunca depende só do ícone (sempre há texto ao lado).
 */
import type { Severidade } from "@/lib/catalogo/tipos";

type P = { className?: string };

/** A lente da marca (anel e ponto de latão), sem o brilho da versão do site: no papel, cor chapada. */
export function MarcaLente({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <circle cx="12" cy="12" r="9.6" fill="none" stroke="#c9a24d" strokeWidth="2.6" />
      <circle cx="12" cy="12" r="3" fill="#c9a24d" />
    </svg>
  );
}

export function IconeOk({ className }: P) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M3.2 8.4l3 3 6.6-7" />
    </svg>
  );
}

export function IconeNao({ className }: P) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className={className}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

export function IconeAtencao({ className }: P) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M8 1.8l6.6 11.6H1.4L8 1.8z" />
      <path d="M8 6.3v3.4" strokeLinecap="round" />
      <circle cx="8" cy="11.6" r="0.55" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconeInfo({ className }: P) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className={className}>
      <circle cx="8" cy="8" r="6.3" />
      <path d="M8 7.2v4" strokeLinecap="round" />
      <circle cx="8" cy="4.9" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Gravidade da tag: triângulo cheio (grave), triângulo vazado (atenção), visto (positivo), "i" (informativo). */
export function IconeGravidade({ severidade, className }: P & { severidade: Severidade }) {
  if (severidade === "grave") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" className={className}>
        <path d="M8 1.6l6.8 12H1.2L8 1.6z" fill="currentColor" />
        <path d="M8 6.2v3.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="8" cy="11.7" r="0.85" fill="#fff" />
      </svg>
    );
  }
  if (severidade === "atencao") return <IconeAtencao className={className} />;
  if (severidade === "positivo") {
    return (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className={className}>
        <circle cx="8" cy="8" r="6.3" />
        <path d="M5.2 8.2l2 2 3.7-4.1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return <IconeInfo className={className} />;
}

/** Impressora (botão "Salvar em PDF"). */
export function IconeImprimir({ className }: P) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M5.5 7V2.8h9V7" />
      <rect x="2.5" y="7" width="15" height="7.2" rx="1.6" />
      <path d="M5.5 11.5h9v5.7h-9z" fill="currentColor" fillOpacity=".12" />
      <circle cx="14.6" cy="9.6" r=".7" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconeVoltar({ className }: P) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M10 3.5L5.5 8l4.5 4.5" />
    </svg>
  );
}

/** Logotipo: lente circular com anel de latão + nome completo. */
export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0 drop-shadow-[0_0_8px_rgba(201,162,77,0.45)]">
      <circle cx="12" cy="12" r="9.6" fill="none" stroke="#C9A24D" strokeWidth="2.6" />
      <circle cx="12" cy="12" r="3" fill="#C9A24D" />
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 font-display text-[17px] font-bold leading-none tracking-[-0.01em] whitespace-nowrap ${className}`}>
      <LogoMark />
      Luneta de Leilões
    </span>
  );
}

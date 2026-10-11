export type SealLevel = 0 | 1 | 2 | 3;

export const SEAL_NAMES: Record<SealLevel, string> = {
  0: "Sem selo",
  1: "Promissor",
  2: "Na Mira",
  3: "Alvo",
};

const RINGS: Record<SealLevel, number[]> = {
  0: [],
  1: [34.5],
  2: [34.5, 21.5],
  3: [34.5, 23.5, 12.5],
};

/**
 * Selo cumulativo: cada nível soma um anel de latão (Promissor 1, Na Mira 2, Alvo 3).
 * Segue a progressão da animação: Promissor levemente desfocado, Na Mira nítido,
 * Alvo com retículo e brilho de luar. Sem selo = anel tracejado em névoa.
 */
export function Seal({
  level,
  size = 64,
  ghost = false,
  className = "",
  title,
}: {
  level: SealLevel;
  size?: number;
  /** mostra um anel "fantasma" extra como convite ao próximo nível (hover dos cartões) */
  ghost?: boolean;
  className?: string;
  /** texto acessível; sem ele o selo é decorativo (o nome aparece ao lado, em texto) */
  title?: string;
}) {
  const rings = RINGS[level];
  const nextRing = level < 3 ? RINGS[(level + 1) as SealLevel][level] : undefined;
  return (
    <svg
      width={size}
      height={size}
      viewBox="-12 -12 96 96"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={`shrink-0 overflow-visible ${level === 1 ? "blur-[0.5px]" : ""} ${className}`}
      data-seal={level}
    >
      {level === 3 && <circle cx="36" cy="36" r="40" fill="rgba(234,240,255,0.10)" className="blur-[6px]" />}
      {level === 0 && (
        <circle cx="36" cy="36" r="34.5" fill="none" stroke="var(--nevoa)" strokeOpacity="0.6" strokeWidth="2" strokeDasharray="5 5" />
      )}
      {rings.map((r, i) => (
        <circle key={r} data-ring={i} cx="36" cy="36" r={r} fill="none" stroke="#C9A24D" strokeWidth="2.5" />
      ))}
      {ghost && nextRing !== undefined && (
        <circle
          data-ghost
          cx="36"
          cy="36"
          r={nextRing}
          fill="none"
          stroke="#C9A24D"
          strokeWidth="2.5"
          className="opacity-0 transition-opacity duration-300 group-hover:opacity-30"
        />
      )}
      {level > 0 && level < 3 && <circle cx="36" cy="36" r="3" fill="#C9A24D" />}
      {level === 3 && (
        <>
          <g stroke="var(--luar)" strokeWidth="1.6">
            <line x1="36" y1="-9" x2="36" y2="6" />
            <line x1="36" y1="66" x2="36" y2="81" />
            <line x1="-9" y1="36" x2="6" y2="36" />
            <line x1="66" y1="36" x2="81" y2="36" />
          </g>
          <circle cx="36" cy="36" r="2.8" fill="#4ADE9A" style={{ filter: "drop-shadow(0 0 4px #4ADE9A)" }} />
        </>
      )}
    </svg>
  );
}

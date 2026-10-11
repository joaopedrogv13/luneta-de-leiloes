import type { ReactNode } from "react";

export type TitleParts = readonly [string, string, string];

/** Título com uma palavra de destaque em Instrument Serif itálico. */
export function Title({ parts, accentClass = "text-latao-texto" }: { parts: TitleParts; accentClass?: string }) {
  const [before, accent, after] = parts;
  const glue = (s: string) => (/^[.,;:!?]/.test(s) ? s : ` ${s}`);
  return (
    <>
      {before} <em className={`accent ${accentClass}`}>{accent}</em>
      {glue(after)}
    </>
  );
}

/** Rótulo + H2 padrão das seções. */
export function SectionHeading({
  id,
  eyebrow,
  parts,
  accentClass,
  className = "",
  children,
}: {
  id?: string;
  eyebrow: string;
  parts: TitleParts;
  accentClass?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={className}>
      <p className="eyebrow mb-5">{eyebrow}</p>
      <h2 id={id} className="h2 max-w-[860px]" data-split>
        <Title parts={parts} accentClass={accentClass} />
      </h2>
      {children}
    </div>
  );
}

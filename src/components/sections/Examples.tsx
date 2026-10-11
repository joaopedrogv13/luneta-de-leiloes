import type { ReactNode } from "react";
import { EXAMPLES } from "@/content/site";
import { SectionHeading } from "@/components/ui/Heading";

/** Exemplos de cada nível (Alvo, Na Mira, Promissor e sem selo). Os cartões entram no passo 4. */
export function Examples({ children }: { children?: ReactNode }) {
  return (
    <section aria-labelledby="exemplos-titulo" className="section">
      <div className="container-l">
        <SectionHeading id="exemplos-titulo" eyebrow={EXAMPLES.eyebrow} parts={EXAMPLES.title} accentClass="text-pos" />
        {children}
        <p className="mt-6 max-w-[760px] text-[13px] leading-relaxed text-nevoa">{EXAMPLES.note}</p>
      </div>
    </section>
  );
}

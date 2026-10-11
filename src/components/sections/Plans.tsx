import type { ReactNode } from "react";
import { PLANS } from "@/content/site";
import { SectionHeading } from "@/components/ui/Heading";
import { RichText } from "@/components/ui/RichText";

/** Planos e preços: Lente, Luneta (destacada) e Telescópio. */
export function Plans({ children }: { children?: ReactNode }) {
  return (
    <section id="planos" aria-labelledby="planos-titulo" className="section">
      <div className="container-l">
        <SectionHeading id="planos-titulo" eyebrow={PLANS.eyebrow} parts={PLANS.title} />
        {children}
        <p className="mt-6 text-xs leading-relaxed text-nevoa">
          <RichText text={PLANS.note} />
        </p>
      </div>
    </section>
  );
}

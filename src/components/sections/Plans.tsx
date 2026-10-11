import Link from "next/link";
import type { ReactNode } from "react";
import { PLANS, SUBSCRIBER_AREA } from "@/content/site";
import { SectionHeading } from "@/components/ui/Heading";
import { RichText } from "@/components/ui/RichText";

/** Planos e preços: Lente, Luneta (destacada) e Telescópio. */
export function Plans({ children }: { children?: ReactNode }) {
  return (
    <section id="planos" aria-labelledby="planos-titulo" className="section">
      <div className="container-l">
        <SectionHeading id="planos-titulo" eyebrow={PLANS.eyebrow} parts={PLANS.title} />
        {children}
        <p className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-nevoa">
          Quer ver como fica depois de assinar?
          <Link href={SUBSCRIBER_AREA.href} className="font-semibold text-latao-texto underline underline-offset-4 hover:text-luar">
            Abrir a {SUBSCRIBER_AREA.label.toLowerCase()} (demonstração) →
          </Link>
        </p>
        <p className="mt-6 text-xs leading-relaxed text-nevoa">
          <RichText text={PLANS.note} />
        </p>
      </div>
    </section>
  );
}

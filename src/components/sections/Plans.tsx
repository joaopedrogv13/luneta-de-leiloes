import Link from "next/link";
import type { ReactNode } from "react";
import { PLANS, SUBSCRIBER_AREA } from "@/content/site";
import { SectionHeading } from "@/components/ui/Heading";
import { RichText } from "@/components/ui/RichText";
import { SeloCancelamento } from "@/components/ui/SeloCancelamento";

/** Planos e preços: Lente, Luneta (destacada) e Telescópio. */
export function Plans({ children }: { children?: ReactNode }) {
  return (
    <section id="planos" aria-labelledby="planos-titulo" className="section">
      <div className="container-l">
        <SectionHeading id="planos-titulo" eyebrow={PLANS.eyebrow} parts={PLANS.title}>
          <p className="mt-5 max-w-[640px] text-base leading-relaxed text-nevoa sm:text-lg">{PLANS.lead}</p>
          {/* rodada 5, ponto 13: o cancelamento grátis em destaque antes dos preços (e de novo sob cada botão) */}
          <SeloCancelamento className="mt-6" />
        </SectionHeading>
        {children}
        <p className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-nevoa">
          Quer ver como fica depois de assinar?
          {/* alvo de 44 px de altura, como os outros links soltos do site (UX-14) */}
          <Link href={SUBSCRIBER_AREA.href} className="inline-flex min-h-11 items-center font-semibold text-latao-texto underline underline-offset-4 hover:text-luar">
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

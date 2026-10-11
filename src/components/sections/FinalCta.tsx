import type { ReactNode } from "react";
import { FINAL_CTA } from "@/content/site";
import { Title } from "@/components/ui/Heading";

/** Chamada final + formulário curto (nome, e-mail, WhatsApp). */
export function FinalCta({ children }: { children?: ReactNode }) {
  return (
    <section id="comecar" aria-labelledby="final-titulo" className="section relative overflow-hidden">
      <div
        aria-hidden="true"
        data-final-glow
        className="pointer-events-none absolute top-1/2 left-1/2 size-[min(900px,120vw)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(201,162,77,.14),rgba(var(--luar-rgb),.04)_40%,transparent_65%)]"
      />
      <div className="container-l relative grid items-center gap-10 md:grid-cols-2 md:gap-20">
        <div data-reveal>
          <h2 id="final-titulo" className="font-display text-[clamp(36px,5vw,68px)] leading-none font-bold tracking-[-0.03em]">
            <Title parts={FINAL_CTA.title} />
          </h2>
          <a href="#planos" data-pulse className="btn-primary mt-8 !min-h-[52px] !px-7 !text-base shadow-[0_0_40px_rgba(201,162,77,.35)]">
            {FINAL_CTA.cta}
          </a>
        </div>
        {children}
      </div>
    </section>
  );
}

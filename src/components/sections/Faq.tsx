"use client";

import { useId, useState } from "react";
import { FAQ } from "@/content/site";
import { SectionHeading } from "@/components/ui/Heading";
import { RichText } from "@/components/ui/RichText";

/**
 * FAQ em acordeão (só uma aberta por vez). Abrir = grid-template-rows 0fr → 1fr (300ms) e o "+" gira 45°.
 * As respostas ficam no HTML mesmo fechadas (para SEO e para o JSON-LD FAQPage).
 */
export function Faq() {
  const [open, setOpen] = useState(0);
  const base = useId();
  return (
    <section aria-labelledby="faq-titulo" className="section bg-tinta">
      <div className="container-l grid items-start gap-10 md:grid-cols-[0.8fr_1.2fr] md:gap-20">
        <SectionHeading id="faq-titulo" eyebrow={FAQ.eyebrow} parts={FAQ.title} />
        <div data-reveal className="border-t border-nevoa/20">
          {FAQ.items.map((f, i) => {
            const isOpen = open === i;
            const btn = `${base}-q${i}`;
            const panel = `${base}-a${i}`;
            return (
              <div key={f.q} className="border-b border-nevoa/20">
                <h3>
                  <button
                    id={btn}
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panel}
                    onClick={() => setOpen(isOpen ? -1 : i)}
                    className="flex w-full items-center justify-between gap-4 py-5 text-left text-[17px] leading-snug font-semibold text-luar"
                  >
                    {f.q}
                    <span
                      aria-hidden="true"
                      className={`flex size-7 shrink-0 items-center justify-center rounded-full border border-latao/60 font-display text-lg text-latao-texto transition-transform duration-300 ${isOpen ? "rotate-45" : ""}`}
                    >
                      +
                    </span>
                  </button>
                </h3>
                <div
                  id={panel}
                  role="region"
                  aria-labelledby={btn}
                  className={`grid transition-[grid-template-rows] duration-300 ease-luneta ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
                >
                  <div className="overflow-hidden" inert={!isOpen}>
                    <p className="pr-10 pb-5 text-[15px] leading-relaxed text-nevoa">
                      <RichText text={f.a} />
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

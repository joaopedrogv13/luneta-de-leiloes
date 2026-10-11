import { LAWYER } from "@/content/site";
import { SectionHeading } from "@/components/ui/Heading";

/** Consultoria com advogado. Atenção: a publicidade de serviços jurídicos segue regras da OAB. */
export function Lawyer() {
  return (
    <section id="advogado" aria-labelledby="advogado-titulo" className="section bg-tinta">
      <div className="container-l grid items-center gap-10 md:grid-cols-2 md:gap-20">
        <div data-reveal>
          <SectionHeading id="advogado-titulo" eyebrow={LAWYER.eyebrow} parts={LAWYER.title} />
          <p className="mt-6 max-w-[520px] text-base leading-relaxed text-nevoa sm:text-lg">{LAWYER.text}</p>
          <a href="#comecar" data-intent="advogado" className="btn-primary mt-8">
            {LAWYER.cta}
          </a>
          <p className="mt-5 max-w-[520px] text-xs leading-relaxed text-nevoa">{LAWYER.oab}</p>
        </div>
        <ol data-steps className="relative grid gap-3">
          {LAWYER.steps.map((s) => (
            <li key={s.n} data-reveal className="card-on-tinta flex gap-4 !rounded-2xl p-5">
              <span aria-hidden="true" className="shrink-0 font-display text-[22px] leading-none font-bold text-latao-texto">
                {s.n}
              </span>
              <div>
                <h3 className="text-base leading-snug font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-nevoa">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

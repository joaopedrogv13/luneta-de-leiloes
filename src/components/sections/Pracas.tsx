import { PRACAS } from "@/content/site";
import { SectionHeading } from "@/components/ui/Heading";

/** Primeira e segunda praça + alerta por e-mail (plano Luneta). Valores do exemplo são fictícios. */
export function Pracas() {
  return (
    <section aria-labelledby="pracas-titulo" className="section bg-tinta">
      <div className="container-l grid items-center gap-10 md:grid-cols-2 md:gap-20">
        <div data-reveal>
          <SectionHeading id="pracas-titulo" eyebrow={PRACAS.eyebrow} parts={PRACAS.title} />
          <p className="mt-6 max-w-[520px] text-base leading-relaxed text-nevoa sm:text-lg">{PRACAS.text}</p>
        </div>
        <figure data-reveal className="flex flex-col gap-3.5">
          <figcaption className="text-[10px] font-medium tracking-[0.14em] text-nevoa uppercase">Exemplo fictício</figcaption>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3">
            <div className="card-on-tinta !rounded-2xl p-4 sm:p-5">
              <p className="text-[11px] font-semibold tracking-[0.14em] text-nevoa uppercase">1ª praça</p>
              <p className="mt-2.5 font-display text-[clamp(20px,5.6vw,26px)] leading-tight font-bold tracking-[-0.02em] text-nevoa">
                R$ 520.000
              </p>
              <p className="mt-1 text-xs text-nevoa">lance mínimo</p>
            </div>
            <svg data-draw-x aria-hidden="true" viewBox="0 0 32 16" className="w-6 origin-left text-latao sm:w-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M2 8h26M22 2l6 6-6 6" />
            </svg>
            <div className="!rounded-2xl border-[1.5px] border-latao/70 bg-noite p-4 sm:p-5">
              <p className="text-[11px] font-semibold tracking-[0.14em] text-latao-texto uppercase">2ª praça</p>
              <p className="mt-2.5 font-display text-[clamp(20px,5.6vw,26px)] leading-tight font-bold tracking-[-0.02em]">
                R$ <span data-count-from="520000" data-count-to="312000" data-count-format="thousands">312.000</span>
              </p>
              <p className="mt-1 text-xs font-semibold text-pos">−40% em relação à 1ª</p>
            </div>
          </div>
          <div data-slide-up className="card-on-tinta flex items-start gap-3.5 !rounded-2xl p-4 sm:px-5">
            <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full border border-latao/50 bg-latao/15 text-latao-texto">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
                <path d="M4 7l8 6 8-6" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold tracking-[0.12em] text-nevoa uppercase">Alerta por e-mail · plano Luneta</p>
              <p className="mt-1.5 text-[15px] leading-snug font-semibold">
                A praça mudou: Casa 2 quartos em Curitiba/PR agora está em 2ª praça.
              </p>
              <p className="mt-1 text-[13px] text-nevoa">Novo lance mínimo R$ 307.200 · encerra em 6 dias</p>
            </div>
          </div>
        </figure>
      </div>
    </section>
  );
}

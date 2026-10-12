import { PRACAS } from "@/content/site";
import { SectionHeading } from "@/components/ui/Heading";

/** Exemplo fictício coerente com o título: a 2ª praça pela metade do valor da 1ª. */
const PRIMEIRA = 400000;
const SEGUNDA = 200000;
const fmt = (n: number) => n.toLocaleString("pt-BR");

/** Primeira e segunda praça + alerta por e-mail quando um favorito vai para a 2ª praça (plano Luneta). */
export function Pracas() {
  return (
    <section aria-labelledby="pracas-titulo" className="section bg-tinta">
      <div className="container-l grid items-center gap-10 md:grid-cols-2 md:gap-20">
        <div data-reveal>
          <SectionHeading id="pracas-titulo" eyebrow={PRACAS.eyebrow} parts={PRACAS.title} />
          <p className="mt-6 max-w-[520px] text-base leading-relaxed text-nevoa sm:text-lg">{PRACAS.text}</p>
          <p className="mt-5 flex max-w-[520px] gap-3 border-l-2 border-latao pl-4 text-base leading-relaxed text-luar sm:text-lg">
            {PRACAS.alert}
          </p>
        </div>

        <figure data-reveal className="flex flex-col gap-3.5">
          <figcaption className="text-[10px] font-medium tracking-[0.14em] text-nevoa uppercase">
            Exemplo fictício · Apartamento 2 quartos, Campinas/SP
          </figcaption>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3">
            <div className="card-on-tinta !rounded-2xl p-4 sm:p-5">
              <p className="text-[11px] font-semibold tracking-[0.14em] text-nevoa uppercase">1ª praça</p>
              <p className="mt-2.5 font-display text-[clamp(20px,5.6vw,26px)] md:text-[clamp(20px,2.6vw,26px)] leading-tight font-bold tracking-[-0.02em] text-nevoa">
                R$ {fmt(PRIMEIRA)}
              </p>
              <p className="mt-1 text-xs text-nevoa">lance mínimo = avaliação</p>
            </div>
            <svg data-draw-x aria-hidden="true" viewBox="0 0 32 16" className="w-6 origin-left text-latao sm:w-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M2 8h26M22 2l6 6-6 6" />
            </svg>
            <div className="relative !rounded-2xl border-[1.5px] border-latao/70 bg-noite p-4 sm:p-5">
              <span className="absolute -top-3 right-3 rounded-full bg-pos px-2.5 py-1 text-[11px] leading-none font-bold text-noite">
                até −50%
              </span>
              <p className="text-[11px] font-semibold tracking-[0.14em] text-latao-texto uppercase">2ª praça</p>
              <p className="mt-2.5 font-display text-[clamp(20px,5.6vw,26px)] md:text-[clamp(20px,2.6vw,26px)] leading-tight font-bold tracking-[-0.02em]">
                R${" "}
                <span data-count-from={PRIMEIRA} data-count-to={SEGUNDA} data-count-format="thousands">
                  {fmt(SEGUNDA)}
                </span>
              </p>
              <p className="mt-1 text-xs font-semibold text-pos">metade do valor da 1ª praça</p>
            </div>
          </div>

          {/* o alerta que o assinante Luneta recebe */}
          <div data-slide-up className="flex items-start gap-3.5 rounded-2xl border border-latao/45 bg-noite p-4 shadow-[0_18px_50px_rgba(0,0,0,.25)] sm:px-5">
            <span aria-hidden="true" className="relative flex size-10 shrink-0 items-center justify-center rounded-full border border-latao/50 bg-latao/15 text-latao-texto">
              <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" />
                <path d="M10 20.5a2 2 0 0 0 4 0" />
              </svg>
              <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-pos ring-2 ring-noite" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold tracking-[0.12em] text-nevoa uppercase">Alerta por e-mail · plano Luneta</p>
              <p className="mt-1.5 text-[15px] leading-snug font-semibold">Seu favorito foi para a 2ª praça.</p>
              <p className="mt-1 text-[13px] leading-snug text-nevoa">
                Apartamento 2 quartos em Campinas/SP · novo lance mínimo <strong className="font-semibold text-luar">R$ {fmt(SEGUNDA)}</strong>{" "}
                · leilão em 6 dias
              </p>
            </div>
          </div>
        </figure>
      </div>
    </section>
  );
}

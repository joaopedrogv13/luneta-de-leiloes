import { LEVELS } from "@/content/site";
import { SEVERITY_ORDER } from "@/content/tags";
import { Title } from "@/components/ui/Heading";
import { CautionCard } from "@/components/niveis/CautionCard";
import { SealTrail } from "@/components/niveis/SealTrail";
import { TagExplorer } from "@/components/niveis/TagExplorer";
import { SEVERITY_TONE, SeverityIcon } from "@/components/niveis/severity";

/**
 * "Tags de risco e selos", na ordem de venda:
 *  1. Atenção: nem todo desconto é uma boa oportunidade.
 *  2. Cartão "Cuidado" com a cena do −55% que esconde riscos (Lente × Luneta).
 *  3. Frase-ponte: por isso, no plano Luneta, a gente separa os melhores casos.
 *  4. Os três selos, do Promissor ao Alvo.
 *  5. Tags de risco: os riscos escondidos, a legenda de cores e as 8 categorias que abrem, com explicação de cada tag.
 *  6. Aviso: a classificação é uma análise, não substitui a avaliação de um especialista.
 */
export function Levels() {
  const T = LEVELS.tags;
  return (
    <section id="niveis" aria-labelledby="niveis-titulo" className="section bg-tinta">
      <div className="container-l">
        <div data-reveal>
          <p className="eyebrow">{LEVELS.eyebrow}</p>
          <p className="mt-5 inline-flex items-center gap-2.5 rounded-full border border-aten/45 bg-aten/10 py-1.5 pr-4 pl-1.5 text-[12px] leading-none font-semibold tracking-[0.16em] text-aten uppercase">
            <span aria-hidden="true" className="flex size-6 items-center justify-center rounded-full bg-aten font-display text-[14px] font-bold tracking-normal text-noite">
              !
            </span>
            {LEVELS.attention}
          </p>
          <h2 id="niveis-titulo" className="h2 mt-5 max-w-[860px]">
            <Title parts={LEVELS.title} />
          </h2>
        </div>

        <CautionCard />

        <SealTrail />

        {/* Tags de risco */}
        <div className="mt-24 border-t border-nevoa/15 pt-16 sm:mt-32 sm:pt-24">
          <div className="grid items-end gap-x-16 gap-y-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
            <div data-reveal>
              <p className="eyebrow">{T.eyebrow}</p>
              <h3 className="mt-5 font-display text-[clamp(30px,3.8vw,48px)] leading-[1.06] font-bold tracking-[-0.025em]">
                <Title parts={T.title} accentClass="text-aten" />
              </h3>
              <p className="mt-5 max-w-[660px] text-base leading-relaxed text-nevoa sm:text-lg">{T.text}</p>
            </div>
            <ul data-reveal aria-label="Legenda das cores das tags" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {SEVERITY_ORDER.map((s) => {
                const tone = SEVERITY_TONE[s];
                return (
                  <li key={s} className="flex items-center gap-3 text-[14px] text-nevoa">
                    <span className={`flex size-7 shrink-0 items-center justify-center rounded-full border ${tone.border} ${tone.bg} ${tone.text}`}>
                      <SeverityIcon severity={s} size={12} />
                    </span>
                    {T.legend[s]}
                  </li>
                );
              })}
            </ul>
          </div>

          <TagExplorer />
        </div>

        <p className="mt-10 text-[13px] leading-relaxed text-nevoa">
          <strong className="font-semibold text-luar">Importante:</strong> {LEVELS.disclaimer}
        </p>
      </div>
    </section>
  );
}

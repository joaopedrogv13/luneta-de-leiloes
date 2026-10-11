import { LEVELS } from "@/content/site";
import { TAG_CATEGORIES } from "@/content/tags";
import { SectionHeading, Title } from "@/components/ui/Heading";
import { Seal, type SealLevel } from "@/components/ui/Seal";
import { Tag } from "@/components/ui/Tag";

/** Os 3 níveis de oportunidade (selos cumulativos) + o alerta de "Cuidado" + todas as tags por categoria. */
export function Levels() {
  return (
    <section id="niveis" aria-labelledby="niveis-titulo" className="section bg-tinta">
      <div className="container-l">
        <SectionHeading id="niveis-titulo" eyebrow={LEVELS.eyebrow} parts={LEVELS.title} />

        <ol className="mt-10 grid gap-4 sm:mt-16 md:grid-cols-3">
          {LEVELS.seals.map((s) => {
            const alvo = s.level === 3;
            return (
              <li
                key={s.name}
                data-reveal
                data-seal-card
                className={`group card-on-tinta p-7 sm:p-8 ${alvo ? "!border-latao/50 shadow-[0_0_60px_rgba(var(--luar-rgb),.06)]" : ""}`}
              >
                <Seal level={s.level as SealLevel} size={72} ghost title={`Selo ${s.name}, ${s.rings}`} />
                <p className="mt-6 text-[11px] font-semibold tracking-[0.16em] text-latao-texto uppercase">{s.rings}</p>
                <h3 className="mt-2 font-display text-[28px] leading-tight font-bold tracking-[-0.02em]">{s.name}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-nevoa">{s.text}</p>
              </li>
            );
          })}
        </ol>

        {/* Atenção · Cuidado: valoriza o plano Luneta */}
        <div
          data-reveal
          data-caution
          className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] items-start gap-5 rounded-[20px] border border-aten/45 bg-noite p-6 shadow-[0_0_60px_rgba(224,180,76,.06)] transition-[border-color,box-shadow] duration-300 hover:border-aten/75 hover:shadow-[0_0_70px_rgba(224,180,76,.12)] sm:p-8"
        >
          <span
            aria-hidden="true"
            data-caution-ring
            className="flex size-[52px] items-center justify-center rounded-full border-2 border-aten font-display text-2xl font-bold text-aten shadow-[0_0_22px_rgba(224,180,76,.25)]"
          >
            !
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-[0.16em] text-aten uppercase">{LEVELS.caution.eyebrow}</p>
            <h3 className="mt-2 font-display text-[clamp(22px,2.4vw,30px)] leading-tight font-bold tracking-[-0.02em]">
              <Title parts={LEVELS.caution.title} accentClass="text-aten" />
            </h3>
            <p className="mt-3 max-w-[720px] text-[15px] leading-relaxed text-nevoa">{LEVELS.caution.text}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Tag label="Ocupado" severity="grave" />
              <Tag label="Dívida passa ao arrematante" severity="grave" />
              <Tag label="Leilão com recurso" severity="atencao" />
              <span aria-hidden="true" className="mx-1 text-nevoa">
                →
              </span>
              <a href="#planos" className="btn-primary !min-h-9 !px-3.5 !text-xs">
                <Seal level={2} size={16} className="[&_circle]:stroke-[#070B16] [&_circle:last-child]:fill-[#070B16]" />
                {LEVELS.caution.cta}
              </a>
            </div>
          </div>
        </div>

        <p className="mt-8 max-w-[760px] text-[15px] leading-relaxed text-nevoa">{LEVELS.tagsNote}</p>

        <details className="group/d mt-6 rounded-[20px] border border-nevoa/20 bg-noite">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-[20px] px-6 py-5 font-semibold [&::-webkit-details-marker]:hidden">
            Ver todas as tags de risco, por categoria
            <span
              aria-hidden="true"
              className="flex size-7 shrink-0 items-center justify-center rounded-full border border-latao/60 font-display text-lg text-latao-texto transition-transform group-open/d:rotate-45"
            >
              +
            </span>
          </summary>
          <div className="grid gap-x-8 gap-y-6 px-6 pb-7 sm:grid-cols-2 lg:grid-cols-4">
            {TAG_CATEGORIES.map((cat) => (
              <div key={cat.name}>
                <h3 className="eyebrow !text-[11px]">{cat.name}</h3>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {cat.tags.map((t) => (
                    <li key={t.label}>
                      <Tag {...t} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>

        <p className="mt-6 text-[13px] leading-relaxed text-nevoa">
          <strong className="font-semibold text-luar">Importante:</strong> {LEVELS.disclaimer}
        </p>
      </div>
    </section>
  );
}

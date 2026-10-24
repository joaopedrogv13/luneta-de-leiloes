import { FILTERS } from "@/content/site";
import { SectionHeading } from "@/components/ui/Heading";
import { FilterDemo } from "./FilterDemo";
import { MolduraFoco } from "./foco/Moldura";

export function Filters() {
  return (
    <section aria-labelledby="filtros-titulo" className="section">
      <div data-reveal className="container-l">
        <SectionHeading id="filtros-titulo" eyebrow={FILTERS.eyebrow} parts={FILTERS.title}>
          <p className="mt-6 max-w-[720px] text-base leading-relaxed text-nevoa sm:text-lg">{FILTERS.text}</p>
        </SectionHeading>
        {/* rodada 5, ponto 9: 150 imóveis fictícios com os filtros da prévia, carregados quando a seção chega perto */}
        <FilterDemo textos={{ ...FILTERS.demo, luneta: FILTERS.luneta }}>
          <MolduraFoco textos={{ ...FILTERS.demo, luneta: FILTERS.luneta }} />
        </FilterDemo>
      </div>
    </section>
  );
}

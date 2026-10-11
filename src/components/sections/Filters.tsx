import { FILTERS } from "@/content/site";
import { SectionHeading } from "@/components/ui/Heading";
import { FilterDemo } from "./FilterDemo";

export function Filters() {
  return (
    <section aria-labelledby="filtros-titulo" className="section">
      <div data-reveal className="container-l">
        <SectionHeading id="filtros-titulo" eyebrow={FILTERS.eyebrow} parts={FILTERS.title} />
        <FilterDemo />
      </div>
    </section>
  );
}

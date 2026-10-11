import { STATS } from "@/content/site";
import { SectionHeading } from "@/components/ui/Heading";
import { Placeholder } from "@/components/ui/RichText";

/**
 * Dados de deságio: 3 números grandes calculados com a própria base. Enquanto o valor for null
 * (src/content/site.ts → STATS.items), aparece o placeholder [X]. Com valor, o número conta até o final.
 */
export function Stats() {
  return (
    <section id="desagio" aria-labelledby="desagio-titulo" className="section bg-tinta">
      <div className="container-l">
        <SectionHeading id="desagio-titulo" eyebrow={STATS.eyebrow} parts={STATS.title} />
        <dl className="mt-10 grid gap-4 sm:mt-16 md:grid-cols-3">
          {STATS.items.map((s) => (
            <div key={s.label} data-reveal className="card-on-tinta flex flex-col-reverse p-7 transition-transform duration-200 hover:-translate-y-1 sm:p-8">
              <dt className="mt-4 text-[15px] font-medium text-nevoa">{s.label}</dt>
              <dd className={`font-display text-[clamp(64px,7vw,104px)] leading-[0.9] font-bold tracking-[-0.05em] ${s.tone === "pos" ? "text-pos" : "text-luar"}`}>
                {s.value === null ? (
                  <Placeholder>[X]</Placeholder>
                ) : (
                  <span data-count-to={s.value} data-count-format={s.suffix ? undefined : "thousands"}>
                    {s.value.toLocaleString("pt-BR")}
                  </span>
                )}
                {s.suffix && <span className="text-latao-texto">{s.suffix}</span>}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-5 text-xs leading-relaxed text-nevoa">
          Números calculados com a nossa própria base de leilões ativos. Não usamos dados de terceiros sem fonte.
        </p>
      </div>
    </section>
  );
}

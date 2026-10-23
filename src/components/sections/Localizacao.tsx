import Link from "next/link";
import { LISTINGS } from "@/content/examples";
import { NOTA_LOCAL } from "@/content/ferramentas";
import { METODO_NOTA } from "@/content/site";
import { SectionHeading } from "@/components/ui/Heading";
import { PESOS_PADRAO, ROTULO_COMPONENTE } from "@/lib/catalogo/localizacao";
import { miniNota } from "./dados-landing";

/** Raio do anel da nota (viewBox 120 × 120). */
const R = 50;

const UMA_CASA = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
/** "11,4 milhões de moradores", "895 mil moradores" (os da cidade da comparação). */
function moradores(n: number): string {
  if (n >= 2_000_000) return `${UMA_CASA.format(n / 1_000_000)} milhões de moradores`;
  if (n >= 1_000_000) return `${UMA_CASA.format(n / 1_000_000)} milhão de moradores`;
  return n >= 1000 ? `${Math.round(n / 1000).toLocaleString("pt-BR")} mil moradores` : `${n.toLocaleString("pt-BR")} moradores`;
}

/**
 * "Nota de localização" (plano Luneta, fundo noite): o que é, os 3 passos, uma miniatura da nota com o exemplo fictício
 * "alvo-sp" (a mesma nota que a página do imóvel da demonstração mostra) e as seis partes com os pesos de PESOS_PADRAO
 * (src/lib/catalogo/localizacao.ts: os pesos nunca são digitados aqui). Componente do servidor, sem JavaScript no
 * navegador; as entradas usam o MotionLayer (data-reveal, data-seal-card com o arco [data-arc] e as barras [data-bar],
 * data-count-to). O método completo fica na página pública METODO_NOTA (/metodologia/localizacao).
 */
export function Localizacao() {
  const { cidade, lugar, loc } = miniNota(LISTINGS);
  const c = NOTA_LOCAL.card;
  // as partes na ordem da tela (pelo peso, maior primeiro), a mesma da página do imóvel
  const partes = loc.componentes.map((x) => x.chave);

  return (
    <section id="localizacao" aria-labelledby="localizacao-titulo" className="section">
      <div className="container-l">
        <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16 xl:gap-20">
          <div data-reveal>
            <SectionHeading id="localizacao-titulo" eyebrow={NOTA_LOCAL.eyebrow} parts={NOTA_LOCAL.title} />
            <p className="mt-6 max-w-[540px] text-base leading-relaxed text-nevoa sm:text-lg">{NOTA_LOCAL.lead}</p>
            <ol data-steps className="mt-9 grid gap-3">
              {NOTA_LOCAL.steps.map((s) => (
                <li key={s.n} className="card flex gap-4 !rounded-2xl p-5">
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
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {/* rodada 5, ponto 10: a mesma nota na página do exemplo, já na seção de localização */}
              <Link href={NOTA_LOCAL.demoHref} prefetch={false} className="btn-outline gap-2">
                {NOTA_LOCAL.demo}
                <span aria-hidden="true">→</span>
              </Link>
              <Link href={METODO_NOTA.href} prefetch={false} className="btn-ghost gap-2">
                {NOTA_LOCAL.more}
              </Link>
            </div>
          </div>

          <figure data-seal-card data-reveal className="flex min-w-0 flex-col gap-3.5">
            <figcaption className="text-[11px] font-medium tracking-[0.14em] text-nevoa uppercase">
              Exemplo fictício · {lugar.replace(" · ", ", ")}
            </figcaption>
            <div className="card !rounded-3xl p-5 shadow-[0_24px_70px_rgba(0,0,0,.28)] sm:p-7">
              <div className="flex items-center gap-4 min-[400px]:gap-5 sm:gap-6">
                <div role="img" aria-label={`Nota ${loc.nota} de 100, exemplo fictício`} className="relative size-[88px] shrink-0 min-[400px]:size-[104px] sm:size-[120px]">
                  <svg viewBox="0 0 120 120" aria-hidden="true" className="size-full -rotate-90">
                    <circle cx="60" cy="60" r={R} fill="none" stroke="currentColor" strokeWidth="9" className="text-nevoa/20" />
                    <circle
                      data-arc
                      cx="60"
                      cy="60"
                      r={R}
                      fill="none"
                      stroke="#C9A24D"
                      strokeWidth="9"
                      strokeLinecap="round"
                      pathLength={1}
                      style={{ ["--v" as string]: loc.nota / 100 }}
                    />
                  </svg>
                  <span aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center">
                    <span data-count-to={loc.nota} className="font-display text-[30px] min-[400px]:text-[34px] leading-none font-bold tracking-[-0.03em] text-luar tabular-nums sm:text-[40px]">
                      {loc.nota}
                    </span>
                    <span className="mt-1 text-[11px] text-nevoa">{c.deCem}</span>
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="font-display text-[clamp(18px,2.2vw,24px)] leading-snug font-bold tracking-[-0.01em]">{c.frase(loc.nota, cidade)}</p>
                  {loc.referencia && loc.precisao && (
                    <p className="mt-2 text-[12px] leading-snug text-nevoa">{c.comparado(moradores(loc.referencia.moradores), c.precisao[loc.precisao])}</p>
                  )}
                </div>
              </div>

              <ul className="mt-6 grid gap-3.5 border-t border-nevoa/15 pt-5">
                {loc.componentes.map((p, i) => (
                  <li key={p.chave}>
                    <p className="flex items-baseline justify-between gap-3 text-[13px] leading-snug">
                      <span className="min-w-0 text-luar">
                        {p.rotulo} <span className="whitespace-nowrap text-nevoa">· {c.peso} {p.peso}%</span>
                      </span>
                      <span className="font-display text-[15px] font-bold text-luar tabular-nums">
                        {p.nota}
                        <span className="sr-only"> de 100</span>
                      </span>
                    </p>
                    <span aria-hidden="true" className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-nevoa/20">
                      <span
                        data-bar
                        className="block h-full origin-left rounded-full bg-latao"
                        style={{ width: `${p.nota ?? 0}%`, ["--bar-delay" as string]: `${(0.4 + i * 0.08).toFixed(2)}s` }}
                      />
                    </span>
                  </li>
                ))}
              </ul>

              {/* a linha de risco do exemplo: o alerta, se houver; senão "nenhuma mapeada a menos de X m" ou "sem
                  mapeamento" (nunca "sem risco") */}
              <p className="mt-5 flex gap-2.5 rounded-xl border border-nevoa/20 px-3.5 py-3 text-[13px] leading-snug">
                <svg viewBox="0 0 24 24" className="mt-px size-4 shrink-0 text-latao-texto" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 3.5 21 19.5H3z" />
                  <path d="M12 10v4.5M12 17.2h.01" />
                </svg>
                <span>
                  <span className="text-luar">
                    {loc.alertas[0]?.titulo ??
                      (!loc.coberturaRisco ? c.semMapeamento : loc.riscoRaioM !== null ? c.risco(loc.riscoRaioM) : c.semPonto)}
                  </span>{" "}
                  <span className="text-nevoa">{c.riscoNota}</span>
                </span>
              </p>
            </div>
          </figure>
        </div>

        {/* No celular, as seis partes com o peso já estão no exemplo acima: o bloco dos cartões fica só a partir de md
            (a seção tinha 5 telas a 360 px; revisão final da rodada 4, UX-05). O método completo é o link acima. */}
        <div className="mt-10 sm:mt-20">
          <h3 className="font-display text-[clamp(22px,2.4vw,28px)] leading-tight font-bold tracking-[-0.02em] max-md:hidden">{NOTA_LOCAL.partesTitulo}</h3>
          <p className="mt-3 max-w-[640px] text-[15px] leading-relaxed text-nevoa max-md:hidden">{NOTA_LOCAL.partesLead}</p>
          <ul data-stagger className="mt-8 grid gap-4 max-md:hidden sm:grid-cols-2 lg:grid-cols-3">
            {partes.map((k) => (
              <li key={k} data-reveal className="card flex flex-col p-6">
                <p className="flex items-start justify-between gap-3">
                  <span className="font-display text-lg leading-snug font-bold tracking-[-0.01em]">{ROTULO_COMPONENTE[k]}</span>
                  <span className="shrink-0 rounded-full bg-latao/15 px-2.5 py-1 font-display text-[15px] leading-none font-bold text-latao-texto tabular-nums">
                    {PESOS_PADRAO[k]}%<span className="sr-only"> da nota</span>
                  </span>
                </p>
                <p className="mt-2 flex-1 text-[15px] leading-relaxed text-nevoa">{NOTA_LOCAL.partes[k].text}</p>
                <p className="mt-4 text-[12px] text-nevoa">
                  <span className="font-semibold text-luar">Fonte:</span> {NOTA_LOCAL.partes[k].fonte}
                </p>
              </li>
            ))}
          </ul>
          <div className="mt-8 grid gap-4 text-[14px] leading-relaxed text-nevoa max-md:hidden md:grid-cols-2 md:gap-10">
            <p className="flex gap-3 border-l-2 border-latao pl-4">{NOTA_LOCAL.risco}</p>
            <p className="flex gap-3 border-l-2 border-nevoa/40 pl-4">{NOTA_LOCAL.fora}</p>
          </div>
          <p className="border-l-2 border-latao pl-4 text-[14px] leading-relaxed text-nevoa md:hidden">{NOTA_LOCAL.foraCurto}</p>
          <p className="mt-6 text-xs leading-relaxed text-nevoa">{NOTA_LOCAL.disclaimer}</p>
        </div>
      </div>
    </section>
  );
}

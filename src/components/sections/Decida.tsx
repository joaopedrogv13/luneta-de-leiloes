import Link from "next/link";
import type { ReactNode } from "react";
import { AVISO_SIMULADOR } from "@/content/avisos";
import { LISTINGS } from "@/content/examples";
import { DECIDA } from "@/content/ferramentas";
import { SectionHeading } from "@/components/ui/Heading";
import { RichText } from "@/components/ui/RichText";
import { curto, moeda } from "@/lib/simulador/formato";
import { juntar, miniSimulador, resumoItbi, totalCurto } from "./dados-landing";

type Icone = (typeof DECIDA.tools)[number]["icon"];

const ICONES: Record<Icone, ReactNode> = {
  // calculadora
  calc: (
    <>
      <rect x="5.5" y="3" width="13" height="18" rx="2.2" />
      <path d="M8.5 6.5h7v3h-7z" />
      <path d="M8.8 13.2h.01M12 13.2h.01M15.2 13.2h.01M8.8 16.8h.01M12 16.8h.01M15.2 16.8h.01" strokeWidth="2.2" />
    </>
  ),
  // régua (o m²)
  m2: (
    <>
      <path d="M3.8 16.2 16.2 3.8l4 4L7.8 20.2z" />
      <path d="M7.4 12.6l1.6 1.6M10 10l2.2 2.2M12.6 7.4l1.6 1.6" />
    </>
  ),
  // folha A4
  doc: (
    <>
      <path d="M7 3h7.2L19 7.8V21H7z" />
      <path d="M14 3v5h5M9.8 12.5h6.4M9.8 15.5h6.4M9.8 18.5h3.8" />
    </>
  ),
  // casa (a página do imóvel)
  casa: (
    <>
      <path d="M4.5 11 12 4.5l7.5 6.5V20h-15z" />
      <path d="M10 20v-5.2h4V20" />
    </>
  ),
};

function IconeOk({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  );
}

function IconeNao({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className={className}>
      <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
    </svg>
  );
}

/** Régua de 5 níveis da comparação (o visual da seção Região da página do imóvel), acesa em `nivel`. */
function Escala({ nivel }: { nivel: number }) {
  const niveis = DECIDA.regiao.niveis;
  return (
    <div role="img" aria-label={`Ilustração da escala: ${niveis[nivel]!.toLowerCase()} (escala de 5: ${niveis.join(", ").toLowerCase()})`} className="mt-4">
      <div aria-hidden="true" className="grid grid-cols-5 gap-1">
        {niveis.map((rotulo, k) => (
          <div key={rotulo} className="min-w-0">
            <span className={`block h-2 rounded-full ${k === nivel ? "bg-latao shadow-[0_0_0_3px_rgba(201,162,77,.18)]" : k === 2 ? "bg-nevoa/30" : "bg-nevoa/15"}`} />
            <span
              className={`mt-2 text-[12px] leading-tight sm:justify-center ${k === 0 ? "justify-start" : k === 4 ? "justify-end" : "justify-center"} ${
                k === nivel ? "flex font-semibold text-luar" : "hidden text-nevoa sm:flex"
              }`}
            >
              <span className="whitespace-nowrap">{rotulo}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * "Decida com números" (plano Luneta, fundo tinta): as ferramentas da página do imóvel e uma miniatura do simulador
 * com o exemplo fictício "alvo-sp". Componente do servidor, sem JavaScript no navegador: os números saem do simulador
 * de verdade no build (dados-landing.ts) e as entradas usam o MotionLayer (data-reveal, data-count-to, data-cascade,
 * data-slide-up).
 */
export async function Decida() {
  const s = miniSimulador(LISTINGS);
  const itbi = await resumoItbi();
  const c = DECIDA.card;
  const cidadesItbi = juntar(itbi.cidades.map((x) => x.cidade));
  const linhaItbi = DECIDA.regiao.itbi
    .replace("{cidades}", cidadesItbi)
    .replace("{n}", DECIDA.mostrarTotalItbi && itbi.transacoes > 0 ? totalCurto(itbi.transacoes) : "[X]");
  const colunas = s.colunas.length;

  return (
    <section id="decida" aria-labelledby="decida-titulo" className="section bg-tinta">
      <div className="container-l grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] lg:gap-16 xl:gap-20">
        <div data-reveal>
          <SectionHeading id="decida-titulo" eyebrow={DECIDA.eyebrow} parts={DECIDA.title} />
          <p className="mt-6 max-w-[540px] text-base leading-relaxed text-nevoa sm:text-lg">{DECIDA.lead}</p>
          <ul className="mt-9 grid gap-6">
            {DECIDA.tools.map((t) => (
              <li key={t.title} className="flex gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full border-[1.5px] border-latao text-latao-texto">
                  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {ICONES[t.icon]}
                  </svg>
                </span>
                <div className="min-w-0">
                  <h3 className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-display text-lg leading-snug font-bold tracking-[-0.01em]">
                    {t.title}
                    <span
                      className={`rounded-full border px-2 py-0.5 font-sans text-[11px] leading-none font-semibold tracking-[0.08em] uppercase ${
                        t.plano === "luneta" ? "border-latao/60 text-latao-texto" : "border-nevoa/40 text-nevoa"
                      }`}
                    >
                      <span className="sr-only">(</span>
                      {DECIDA.planos[t.plano]}
                      <span className="sr-only">)</span>
                    </span>
                  </h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-nevoa">{t.text}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <a href="#planos" data-intent="luneta" className="btn-primary">
              {DECIDA.cta}
            </a>
            <Link href={DECIDA.demoHref} prefetch={false} className="btn-outline">
              {DECIDA.demo}
            </Link>
          </div>
        </div>

        <figure data-reveal className="flex min-w-0 flex-col gap-3.5">
          <figcaption className="text-[11px] font-medium tracking-[0.14em] text-nevoa uppercase">
            Exemplo fictício · {s.titulo}, {s.lugar}
          </figcaption>

          <div className="card-on-tinta !rounded-3xl p-5 shadow-[0_24px_70px_rgba(0,0,0,.28)] sm:p-7">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[11px] font-semibold tracking-[0.14em] text-latao-texto uppercase">{c.eyebrow}</p>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-nevoa/25 px-2.5 py-1 text-[11px] font-medium text-nevoa">
                <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {ICONES.doc}
                </svg>
                {c.pdf}
              </span>
            </div>
            <p className="mt-3 text-[15px] leading-snug text-nevoa">{c.pergunta(s.objetivo, s.meses, s.cenario)}</p>
            <p className="mt-4 text-sm font-semibold text-luar">{c.resposta}</p>
            <p className="mt-1 font-display text-[clamp(40px,5.2vw,64px)] leading-none font-bold tracking-[-0.04em] whitespace-nowrap text-latao-texto tabular-nums">
              R$&nbsp;
              <span data-count-from={s.lanceMinimo} data-count-to={s.teto} data-count-format="thousands">
                {s.teto.toLocaleString("pt-BR")}
              </span>
            </p>
            <p className="mt-3 text-[13px] leading-relaxed text-nevoa">
              {c.minimo}: <strong className="font-semibold whitespace-nowrap text-luar">{moeda(s.lanceMinimo)}</strong> ·{" "}
              <span className="whitespace-nowrap">
                {c.folga[0]} <strong className="font-semibold text-pos">{moeda(s.folga)}</strong> {c.folga[1]}
              </span>
            </p>

            <div data-cascade className="mt-6 border-t border-nevoa/15 pt-5">
              <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-[13px] font-semibold text-luar">{c.matriz}</span>
                <span className="text-[11px] text-nevoa">{c.matrizUnidade}</span>
              </p>
              <table className="mt-3 w-full table-fixed border-separate border-spacing-1 text-center">
                <caption className="sr-only">{c.matrizSr}</caption>
                <thead>
                  <tr>
                    {/* abaixo de 480 px só a linha "Base" aparece: a coluna do rótulo encolhe para as células caberem */}
                    <th scope="col" className="w-[27%] text-left max-[479px]:w-[17%]">
                      <span className="sr-only">Cenário</span>
                    </th>
                    {s.colunas.map((m) => (
                      <th key={m} scope="col" className="pb-1 font-normal">
                        <span className="block font-display text-[15px] leading-none font-bold text-luar">{m}</span>
                        <span className="block text-[10px] leading-tight text-nevoa">meses</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.linhas.map((linha, i) => (
                    <tr key={linha.cenario} className={linha.cenario === "base" ? "" : "max-[479px]:hidden"}>
                      <th scope="row" className="pr-1 text-left text-[12px] leading-tight font-medium text-nevoa">
                        {linha.rotulo}
                      </th>
                      {linha.celulas.map((cel, j) => {
                        // cascata das células, linha a linha (0,35 s + 0,04 s por célula)
                        const k = i * colunas + j;
                        return (
                          <td key={cel.meses} className="p-0">
                            <span
                              data-cell
                              style={{ ["--cell-delay" as string]: `${(0.35 + k * 0.04).toFixed(2)}s` }}
                              className={`flex flex-col items-center gap-0.5 rounded-lg py-2 ${cel.atinge ? "bg-pos/10" : "bg-grave/10"} ${
                                cel.escolhida ? "ring-2 ring-latao ring-offset-0" : ""
                              }`}
                            >
                              <span className="text-[13px] leading-none font-semibold whitespace-nowrap text-luar tabular-nums">
                                {cel.teto === null ? "—" : curto(cel.teto)}
                              </span>
                              {cel.atinge ? <IconeOk className="size-3.5 text-pos" /> : <IconeNao className="size-3.5 text-grave-texto" />}
                              <span className="sr-only">
                                {cel.teto === null ? "" : `R$ ${cel.teto.toLocaleString("pt-BR")}, `}
                                {cel.atinge ? c.atinge : c.naoAtinge}
                                {cel.escolhida ? " (o cenário e o prazo do cartão)" : ""}
                              </span>
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[12px] text-nevoa min-[480px]:hidden">{c.soBase}</p>
            </div>

            <p className="mt-5 text-[12px] leading-relaxed text-nevoa">
              {DECIDA.disclaimerPrefixo} {AVISO_SIMULADOR}
            </p>
          </div>

          {/* a régua da região: ilustração, sem número (o exemplo não tem preço da região na landing) */}
          <div data-slide-up className="rounded-2xl border border-latao/35 bg-noite p-4 shadow-[0_18px_50px_rgba(0,0,0,.22)] sm:p-5">
            <p className="text-[11px] font-semibold tracking-[0.12em] text-nevoa uppercase">{DECIDA.regiao.eyebrow}</p>
            <p className="mt-1.5 text-[15px] leading-snug font-semibold">{DECIDA.regiao.title}</p>
            <Escala nivel={1} />
            {itbi.cidades.length > 0 && (
              <p className="mt-4 text-[13px] leading-relaxed text-nevoa">
                <RichText text={linhaItbi} />
              </p>
            )}
          </div>
        </figure>
      </div>
    </section>
  );
}

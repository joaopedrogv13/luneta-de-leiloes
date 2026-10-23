import Link from "next/link";
import type { ReactNode } from "react";
import { PRACAS } from "@/content/site";
import { SectionHeading } from "@/components/ui/Heading";

/** Exemplo fictício coerente com o título: a 2ª praça pela metade do valor da 1ª. */
const PRIMEIRA = 400000;
const SEGUNDA = 200000;
const fmt = (n: number) => n.toLocaleString("pt-BR");

const ICONES: Record<(typeof PRACAS.passos)[number]["icone"], ReactNode> = {
  coracao: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  radar: (
    <>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
      <path d="M8.2 12a3.8 3.8 0 1 0 1.1-2.7" />
      <path d="M12 12 6.7 6.7" />
    </>
  ),
  envelope: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
};

/**
 * Primeira e segunda praça + o alerta por e-mail quando um favorito muda de praça (plano Luneta). Com
 * PRODUTO.alertaPraca (src/lib/catalogo/produto.ts; ligado pelo dono na rodada 5, ponto 8) a seção mostra o e-mail de
 * exemplo, os três passos do alerta (marque o favorito → a Luneta confere a cada atualização → você recebe o e-mail
 * com o novo lance mínimo e a data) e o link para a demonstração, que já chega com a opção do favorito aberta
 * (#alerta-praca). Sem o alerta, a frase fala só dos favoritos.
 */
export function Pracas() {
  return (
    <section id="pracas" aria-labelledby="pracas-titulo" className="section bg-tinta">
      <div className="container-l">
        <div className="grid items-center gap-10 md:grid-cols-2 md:gap-20">
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
                <p className="mt-2.5 font-display text-[clamp(20px,5.6vw,26px)] leading-tight font-bold tracking-[-0.02em] text-nevoa md:text-[clamp(20px,2.6vw,26px)]">
                  R$ {fmt(PRIMEIRA)}
                </p>
                <p className="mt-1 text-xs text-nevoa">lance mínimo = avaliação</p>
              </div>
              <svg data-draw-x aria-hidden="true" viewBox="0 0 32 16" className="w-6 origin-left text-latao sm:w-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M2 8h26M22 2l6 6-6 6" />
              </svg>
              <div className="relative !rounded-2xl border-[1.5px] border-latao/70 bg-noite p-4 sm:p-5">
                <span className="absolute -top-3 right-3 rounded-full bg-pos px-2.5 py-1 text-[11px] leading-none font-bold text-noite">até −50%</span>
                <p className="text-[11px] font-semibold tracking-[0.14em] text-latao-texto uppercase">2ª praça</p>
                <p className="mt-2.5 font-display text-[clamp(20px,5.6vw,26px)] leading-tight font-bold tracking-[-0.02em] md:text-[clamp(20px,2.6vw,26px)]">
                  R${" "}
                  <span data-count-from={PRIMEIRA} data-count-to={SEGUNDA} data-count-format="thousands">
                    {fmt(SEGUNDA)}
                  </span>
                </p>
                <p className="mt-1 text-xs font-semibold text-pos">metade do valor da 1ª praça</p>
              </div>
            </div>

            {/* o e-mail que o assinante Luneta recebe (ilustração; com PRODUTO.alertaPraca) */}
            {PRACAS.mostrarAlerta && (
              <div data-slide-up className="flex items-start gap-3.5 rounded-2xl border border-latao/45 bg-noite p-4 shadow-[0_18px_50px_rgba(0,0,0,.25)] sm:px-5">
                <span aria-hidden="true" className="relative flex size-10 shrink-0 items-center justify-center rounded-full border border-latao/50 bg-latao/15 text-latao-texto">
                  <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" />
                    <path d="M10 20.5a2 2 0 0 0 4 0" />
                  </svg>
                  <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-latao ring-2 ring-noite" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold tracking-[0.12em] text-nevoa uppercase">{PRACAS.email.rotulo}</p>
                  <p className="mt-1.5 text-[15px] leading-snug font-semibold">{PRACAS.email.titulo}</p>
                  <p className="mt-1 text-[13px] leading-snug text-nevoa">
                    Apartamento 2 quartos em Campinas/SP · novo lance mínimo <strong className="font-semibold text-luar">R$ {fmt(SEGUNDA)}</strong> · leilão em 6
                    dias, às 14h
                  </p>
                </div>
              </div>
            )}
          </figure>
        </div>

        {/* os três passos do alerta, na largura toda (rodada 5, ponto 8: mais foco nos favoritos com aviso de praça) */}
        {PRACAS.mostrarAlerta && (
          <div className="mt-14 border-t border-nevoa/15 pt-10 sm:mt-20 sm:pt-14">
            <h3 data-reveal className="font-display text-[clamp(22px,2.4vw,28px)] leading-tight font-bold tracking-[-0.02em]">
              {PRACAS.passosTitulo}
            </h3>
            <ol data-stagger className="mt-7 grid gap-3 sm:gap-4 md:grid-cols-3">
              {PRACAS.passos.map((p, i) => (
                <li key={p.titulo} data-reveal className="card-on-tinta relative flex gap-4 !rounded-2xl p-5 md:flex-col md:gap-5 md:p-6">
                  <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-full border-[1.5px] border-latao text-latao-texto">
                    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      {ICONES[p.icone]}
                    </svg>
                  </span>
                  <div>
                    <p className="text-[11px] font-semibold tracking-[0.14em] text-nevoa uppercase">
                      Passo {i + 1}
                      <span className="sr-only"> de {PRACAS.passos.length}</span>
                    </p>
                    <p className="mt-1 text-base leading-snug font-semibold">{p.titulo}</p>
                    <p className="mt-1 text-sm leading-relaxed text-nevoa">{p.texto}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link href={PRACAS.demoHref} prefetch={false} className="btn-outline gap-2">
                {PRACAS.demo}
                <span aria-hidden="true">→</span>
              </Link>
              <p className="max-w-[520px] text-xs leading-relaxed text-nevoa">{PRACAS.aviso}</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

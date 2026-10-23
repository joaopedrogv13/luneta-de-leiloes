import Link from "next/link";
import { LEVELS } from "@/content/site";
import { SEVERITY_LABEL, type Severity } from "@/content/tags";
import { Title } from "@/components/ui/Heading";
import { Seal } from "@/components/ui/Seal";
import { Tag } from "@/components/ui/Tag";
import "./niveis.css";

const C = LEVELS.caution;
const D = C.demo;

/** Cor do pulso de cada tag revelada (a cena só usa riscos graves e de atenção). */
const PING: Record<Severity, string> = {
  grave: "border-grave",
  atencao: "border-aten",
  positivo: "border-pos",
  info: "border-nevoa",
};

/**
 * Cena "Cuidado" (exemplo fictício). Quando boa parte do bloco entra na tela ([data-play] → .is-in):
 * o deságio verde chama atenção, a varredura da Luneta desce pelas tags desfocadas da visão Lente e
 * revela, uma a uma, os riscos que o desconto escondia (com um pulso âmbar/vermelho); no fim o −55%
 * perde o brilho, é riscado e aparece "desconto ≠ oportunidade". Só transform e opacity.
 * Sem movimento (ou sem JS de animação), o HTML já mostra o estado final.
 */
function CautionDemo() {
  const tagsText = D.tags.map((t) => `${t.label} (${SEVERITY_LABEL[t.severity].toLowerCase()}, ${t.source})`).join(", ");
  return (
    <figure
      data-play
      className="nv-demo relative min-w-0 self-center overflow-hidden rounded-[20px] border border-nevoa/20 bg-tinta p-5 shadow-[0_24px_60px_rgba(7,11,22,.2)] [grid-area:demo] sm:p-6"
    >
      <figcaption className="sr-only">
        Exemplo fictício: {D.title} em {D.place}, com {D.desagio}% de deságio no anúncio. No edital e no processo, a
        análise da Luneta encontra: {tagsText}. Ou seja, {D.verdict.replace("≠", "não é")}.
      </figcaption>

      <div aria-hidden="true">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] font-medium tracking-[0.14em] text-nevoa uppercase">Exemplo fictício</p>
          {/* visão Lente → visão Luneta (as duas no mesmo lugar, trocam por opacidade) */}
          <span className="grid justify-items-end">
            <span
              className="nv-view-lente inline-flex items-center gap-1.5 rounded-full border border-nevoa/40 px-2.5 py-1 text-[11px] font-semibold text-nevoa [grid-area:1/1]"
            >
              <span className="size-2.5 rounded-full border-[1.5px] border-current" />
              {D.lente}
            </span>
            <span
              className="nv-view-luneta inline-flex items-center gap-1.5 rounded-full border border-latao/60 bg-latao/10 px-2.5 py-1 text-[11px] font-semibold text-latao-texto [grid-area:1/1]"
            >
              <Seal level={2} size={13} />
              {D.luneta}
            </span>
          </span>
        </div>

        <p className="mt-3 font-display text-[17px] leading-tight font-bold tracking-[-0.01em]">{D.title}</p>
        <p className="mt-0.5 text-[13px] leading-snug text-nevoa">{D.place}</p>

        <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-2">
          <span className="nv-number relative inline-grid">
            <span className="nv-glow pointer-events-none absolute -inset-x-6 -inset-y-4" />
            <span className="nv-num-pos font-display text-[clamp(60px,6.4vw,84px)] leading-[0.9] font-bold tracking-[-0.05em] text-pos [grid-area:1/1]">
              −{D.desagio}%
            </span>
            <span className="nv-num-fog font-display text-[clamp(60px,6.4vw,84px)] leading-[0.9] font-bold tracking-[-0.05em] text-nevoa [grid-area:1/1]">
              −{D.desagio}%
            </span>
            <span className="nv-strike absolute top-[50%] -right-[4%] -left-[4%] h-[3px] rounded-full bg-grave" />
          </span>
          <span
            className="nv-verdict mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-aten/55 bg-aten/10 px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-aten"
          >
            <span className="font-display text-[13px] leading-none font-bold">!</span>
            {D.verdict}
          </span>
        </div>
        <p className="mt-2.5 text-xs font-medium tracking-[0.06em] text-nevoa uppercase">deságio · lance mínimo {D.lance}</p>

        <div className="mt-5 border-t border-nevoa/15 pt-4">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-latao-texto uppercase">{D.hiddenLabel}</p>
          <div className="relative mt-3">
            <ul className="grid gap-2">
              {D.tags.map((t, i) => (
                <li key={t.label} className="flex items-center gap-3" style={{ ["--i" as string]: i }}>
                  <span className="grid shrink-0">
                    {/* visão Lente: tag desfocada */}
                    <span className="nv-blurred [grid-area:1/1]">
                      <Tag label={t.label} severity={t.severity} />
                    </span>
                    {/* visão Luneta: tag nítida + pulso na cor da gravidade */}
                    <span className="nv-sharp relative [grid-area:1/1]">
                      <span className={`nv-ping absolute -inset-[3px] rounded-full border-2 ${PING[t.severity]}`} />
                      <Tag label={t.label} severity={t.severity} />
                    </span>
                  </span>
                  {/* onde o risco estava: no edital ou no processo, não no anúncio */}
                  <span className="nv-src hidden min-w-0 flex-1 items-center gap-2 text-[11px] font-medium whitespace-nowrap text-nevoa sm:flex">
                    <span className="h-px min-w-3 flex-1 border-t border-dashed border-nevoa/30" />
                    {t.source}
                  </span>
                </li>
              ))}
            </ul>
            <span className="nv-lock absolute inset-0 flex items-center justify-center">
              <span className="rounded-full border border-latao/60 bg-noite/90 px-3 py-1.5 text-[11px] font-semibold text-latao-texto">
                {D.locked}
              </span>
            </span>
            {/* varredura da Luneta: linha de latão com retículo, de cima para baixo */}
            <span className="pointer-events-none absolute -inset-x-2 -inset-y-1 overflow-hidden">
              <span className="nv-beam absolute inset-0">
                <span className="nv-trail absolute inset-x-0 -top-9 h-9" />
                <span className="absolute inset-x-0 top-0 h-[2px] bg-latao shadow-[0_0_10px_rgba(201,162,77,.8)]" />
                <span className="absolute top-0 left-1 flex size-4 -translate-y-1/2 items-center justify-center rounded-full border-[1.5px] border-latao bg-tinta">
                  <span className="size-1 rounded-full bg-latao" />
                </span>
              </span>
            </span>
          </div>
        </div>
      </div>
    </figure>
  );
}

/** Ícone da lente simples (plano Lente): um anel em névoa. */
function LenteIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="shrink-0">
      <circle cx="9" cy="9" r="7.2" />
    </svg>
  );
}

/** Cartão "Cuidado": texto + comparação Lente × Luneta + chamada, ao lado da cena animada. */
export function CautionCard() {
  return (
    <div
      data-reveal
      className="nv-caution relative mt-10 grid gap-x-12 gap-y-8 overflow-hidden rounded-[24px] border border-aten/45 bg-noite p-6 shadow-[0_0_60px_rgba(224,180,76,.06)] [grid-template-areas:'text'_'demo'_'cta'] sm:mt-14 sm:p-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:grid-rows-[auto_1fr] md:[grid-template-areas:'text_demo'_'cta_demo'] lg:p-10"
    >
      {/* brilho âmbar parado no canto (sem animação) */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 -left-40 size-[420px] rounded-full bg-[radial-gradient(closest-side,rgba(224,180,76,.12),transparent)]"
      />

      <div className="relative min-w-0 [grid-area:text]">
        <p className="flex items-center gap-3 text-[12px] font-semibold tracking-[0.16em] text-aten uppercase">
          <span
            aria-hidden="true"
            className="nv-ring flex size-10 items-center justify-center rounded-full border-2 border-aten font-display text-lg font-bold"
          >
            !
          </span>
          {C.eyebrow}
        </p>
        <h3 className="mt-4 font-display text-[clamp(26px,2.8vw,36px)] leading-[1.1] font-bold tracking-[-0.02em]">
          <Title parts={C.title} accentClass="text-aten" />
        </h3>
        <p className="mt-4 text-[15px] leading-relaxed text-nevoa sm:text-base">{C.text}</p>
        <ul className="mt-6 grid gap-2.5 text-[14px] leading-snug sm:text-[15px]">
          <li className="flex items-center gap-3 rounded-2xl border border-nevoa/20 px-4 py-3 text-nevoa">
            <LenteIcon />
            <span>
              <strong className="font-semibold text-luar">{C.compare[0].plan}:</strong> {C.compare[0].text}
            </span>
          </li>
          <li className="flex items-center gap-3 rounded-2xl border border-latao/50 bg-latao/[0.08] px-4 py-3 text-luar">
            <Seal level={2} size={18} />
            <span>
              <strong className="font-semibold text-latao-texto">{C.compare[1].plan}:</strong> {C.compare[1].text}
            </span>
          </li>
        </ul>
      </div>

      <CautionDemo />

      <div className="relative flex flex-wrap items-center gap-x-6 gap-y-3 self-start [grid-area:cta]">
        <a href="#planos" className="btn-primary">
          <Seal level={2} size={16} className="[&_circle]:stroke-[#070B16] [&_circle:last-child]:fill-[#070B16]" />
          {C.cta}
          <span aria-hidden="true">→</span>
        </a>
        {/* rodada 5, ponto 10: o caso parecido da demonstração, já na seção de riscos */}
        <Link
          href={LEVELS.demoHref}
          prefetch={false}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-latao-texto underline decoration-latao/50 underline-offset-4 hover:text-luar"
        >
          {LEVELS.demo}
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </div>
  );
}

import { PROBLEM } from "@/content/site";
import { SectionHeading } from "@/components/ui/Heading";
import { RichText } from "@/components/ui/RichText";

const FLOATING = [
  { cls: "left-[4%] top-[8%] w-[46%] -rotate-[5deg] blur-[1.5px]", dur: "7s", delay: "0s", tag: "bg-grave/35 w-[70px]" },
  { cls: "right-[2%] top-[2%] w-[44%] rotate-[4deg] blur-[2.5px]", dur: "9s", delay: "-2s", tag: "" },
  { cls: "left-[18%] bottom-[6%] w-1/2 rotate-2 blur-[1px]", dur: "8s", delay: "-4s", tag: "bg-aten/35 w-[60px]" },
  { cls: "right-[6%] bottom-[14%] w-[36%] -rotate-3 blur-[3px]", dur: "6s", delay: "-1s", tag: "" },
];

/** Faixa rolante dos leiloeiros monitorados, que passa por dentro de uma lente no centro. */
function Marquee() {
  const items = PROBLEM.marquee;
  const row = (inLens: boolean) => (
    <div
      className={`flex w-max animate-marquee items-center gap-10 pl-10 whitespace-nowrap font-display text-[13px] font-semibold tracking-[0.14em] uppercase group-hover:[animation-play-state:paused] ${
        inLens ? "text-[#EAF0FF]" : "text-nevoa"
      }`}
    >
      {[0, 1].map((copy) => (
        <span key={copy} className="flex items-center gap-10" aria-hidden={copy === 1 || inLens ? true : undefined}>
          <span>Leiloeiros monitorados</span>
          {items.map((name) => (
            <span key={name} className="flex items-center gap-10">
              <span className="text-latao-texto">·</span>
              <RichText text={name} />
            </span>
          ))}
          <span className="text-latao-texto">·</span>
        </span>
      ))}
    </div>
  );
  return (
    <div className="group relative mt-14 h-14 overflow-hidden rounded-full border border-latao/35 bg-tinta shadow-[inset_0_0_0_4px_var(--noite),inset_0_0_0_5px_rgba(201,162,77,.25)] sm:mt-20">
      <div className="absolute inset-0 flex items-center">{row(false)}</div>
      {/* a lente: mesma faixa, ampliada e em luar, recortada num círculo no centro */}
      <div
        aria-hidden="true"
        className="absolute inset-0 flex items-center [clip-path:circle(46px_at_50%_50%)]"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,#16224A,transparent_60px)]" />
        <div className="relative origin-center scale-y-110">{row(true)}</div>
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute top-1/2 left-1/2 size-[92px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-latao shadow-[0_0_0_2px_#5A4414,0_0_24px_rgba(201,162,77,.35)]" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,var(--tinta)_0,transparent_12%,transparent_88%,var(--tinta)_100%)]" />
    </div>
  );
}

export function Problem() {
  return (
    <section id="como-funciona" aria-labelledby="problema-titulo" className="section relative overflow-hidden !pb-0">
      <div data-reveal className="container-l grid items-center gap-10 md:grid-cols-2 md:gap-20">
        <div>
          <SectionHeading id="problema-titulo" eyebrow={PROBLEM.eyebrow} parts={PROBLEM.title} accentClass="text-nevoa" />
          <p className="mt-6 max-w-[520px] text-base leading-relaxed text-nevoa sm:text-lg">{PROBLEM.text}</p>
        </div>
        {/* Sites dos leiloeiros espalhados e desfocados, flutuando na névoa */}
        <div aria-hidden="true" className="relative h-[300px] sm:h-[340px]">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_50%,rgba(var(--fog-rgb),.35),transparent_70%)] blur-md" />
          {FLOATING.map((f, i) => (
            <div
              key={i}
              className={`absolute rounded-[10px] border border-nevoa/20 bg-tinta p-3.5 motion-safe:animate-[float_var(--d)_ease-in-out_infinite] ${f.cls}`}
              style={{ ["--d" as string]: f.dur, animationDelay: f.delay }}
            >
              <div className="h-2 w-1/2 rounded bg-nevoa/50" />
              <div className="mt-3 h-1.5 w-[85%] rounded bg-nevoa/25" />
              <div className="mt-2 h-1.5 w-[60%] rounded bg-nevoa/25" />
              {f.tag && <div className={`mt-3.5 h-5 rounded ${f.tag}`} />}
            </div>
          ))}
        </div>
      </div>
      <div className="container-l">
        <Marquee />
      </div>
    </section>
  );
}

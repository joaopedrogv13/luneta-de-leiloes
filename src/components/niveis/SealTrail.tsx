import { LEVELS } from "@/content/site";
import { Title } from "@/components/ui/Heading";
import { Seal, type SealLevel } from "@/components/ui/Seal";
import "./niveis.css";

const CARD_TONE: Record<number, string> = {
  1: "",
  2: "!border-latao/30",
  3: "!border-latao/55 shadow-[0_0_60px_rgba(var(--luar-rgb),.06)]",
};

/**
 * Frase-ponte ("Por isso, no plano Luneta, a gente separa os melhores casos para você.") e os três
 * selos, do Promissor ao Alvo. Uma linha de latão desce do cartão "Cuidado" até a frase; entre os
 * cartões, um marcador mostra a progressão 1 → 2 → 3 anéis. Os anéis são desenhados em sequência
 * ([data-seal-card], globals.css).
 */
export function SealTrail() {
  return (
    <>
      <div data-reveal className="nv-bridge mx-auto flex max-w-[920px] flex-col items-center text-center">
        <span aria-hidden="true" className="nv-line block h-16 w-px sm:h-20" />
        <span aria-hidden="true" className="size-2 rounded-full bg-latao shadow-[0_0_12px_rgba(201,162,77,.7)]" />
        <h3 className="mt-6 font-display text-[clamp(28px,3.6vw,46px)] leading-[1.08] font-bold tracking-[-0.025em]">
          <Title parts={LEVELS.bridge} />
        </h3>
        <p className="mt-4 max-w-[600px] text-[15px] leading-relaxed text-nevoa sm:text-lg">{LEVELS.sealsNote}</p>
      </div>

      <ol className="mt-10 grid gap-6 sm:mt-14 md:grid-cols-3">
        {LEVELS.seals.map((s, i) => (
          <li
            key={s.name}
            data-reveal
            data-seal-card
            className={`group card-on-tinta relative p-7 sm:p-8 ${CARD_TONE[s.level]}`}
          >
            {i < LEVELS.seals.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute -bottom-[26px] left-1/2 z-10 flex size-7 -translate-x-1/2 items-center justify-center rounded-full border border-latao/55 bg-tinta text-latao-texto md:top-[54px] md:-right-[26px] md:bottom-auto md:left-auto md:translate-x-0"
              >
                <svg viewBox="0 0 12 12" className="size-3 rotate-90 md:rotate-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4.5 2.5L8 6l-3.5 3.5" />
                </svg>
              </span>
            )}
            <div className="flex items-start justify-between gap-4">
              <Seal level={s.level as SealLevel} size={72} ghost title={`Selo ${s.name}, ${s.rings}`} />
              <span className="flex flex-col items-end gap-2 pt-1.5 text-[11px] font-semibold tracking-[0.14em] text-nevoa uppercase">
                <span aria-hidden="true" className="flex gap-1">
                  {[1, 2, 3].map((n) => (
                    <span key={n} className={`h-1 w-5 rounded-full ${n <= s.level ? "bg-latao" : "bg-nevoa/25"}`} />
                  ))}
                </span>
                Nível {s.level} de 3
              </span>
            </div>
            <p className="mt-6 text-[11px] font-semibold tracking-[0.16em] text-latao-texto uppercase">{s.rings}</p>
            <h4 className="mt-2 font-display text-[28px] leading-tight font-bold tracking-[-0.02em]">{s.name}</h4>
            <p className="mt-3 text-[15px] leading-relaxed text-nevoa">{s.text}</p>
          </li>
        ))}
      </ol>
    </>
  );
}

"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { HERO } from "@/content/site";
import { BrazilMap } from "@/components/ui/BrazilMap";
import { RichText } from "@/components/ui/RichText";
import { Seal } from "@/components/ui/Seal";
import { BRAZIL_PINS } from "@/lib/brazil";

// useLayoutEffect só no cliente (evita aviso no SSR).
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const ALVO_DESAGIO = 48;
const [SP_X, SP_Y] = BRAZIL_PINS.sp;
const SP_LEFT = `${(SP_X / 400) * 100}%`;
const SP_TOP = `${(SP_Y / 400) * 100}%`;

const BRASS = "linear-gradient(180deg,#F3DA8E 0%,#C9A24D 38%,#8C6B23 78%,#5A4414 100%)";
const LENS_REST = "0 0 0 2px #5A4414, 0 30px 80px rgba(0,0,0,0.6)";
const LENS_GLOW = "0 0 0 2px #5A4414, 0 0 90px 10px rgba(234,240,255,0.22), 0 0 160px 40px rgba(201,162,77,0.18)";
const CTA_GLOW = "0 0 0 4px rgba(201,162,77,0.25), 0 0 44px rgba(201,162,77,0.55)";

/** Cartões desfocados ao fundo = os sites dos leiloeiros, cada um no seu canto. */
const SITES = [
  { pos: "left-[44%] top-[14%] w-[150px] h-[92px] -rotate-6", bar: "bg-latao/50" },
  { pos: "left-[84%] top-[30%] w-[140px] h-[88px] rotate-[5deg]", bar: "" },
  { pos: "left-[50%] top-[80%] w-[160px] h-[84px] rotate-3", bar: "bg-grave/50" },
  { pos: "left-[86%] top-[70%] w-[130px] h-[80px] -rotate-[4deg]", bar: "" },
];

/**
 * HERO · a luneta chega ao alvo.
 *
 * A cena fica presa na tela (position: sticky) enquanto a seção rola: ~3 telas no desktop e 1,5 no celular.
 * Um único timeline GSAP com ScrollTrigger (scrub) percorre as 6 etapas do blueprint (Passo 4):
 *   1. 0–12%   Noite e névoa: estrelas, névoa densa e uma luneta pequena ao longe. Título já visível.
 *   2. 12–35%  A luneta se aproxima: cresce e se alinha ao centro; a névoa abre; os sites dos leiloeiros
 *              aparecem desfocados ao fundo (com leve parallax).
 *   3. 35–50%  A luneta se estende: os tubos de latão deslizam e a objetiva vira a moldura circular.
 *   4. 50–70%  Foco: o mapa do Brasil entra em foco, os pins acendem e pulsam; os cartões ficam nítidos.
 *   5. 70–88%  Mira travada: o retículo desliza até o pin de São Paulo e trava; o cartão do Alvo abre,
 *              o deságio conta até 48% e aparece o selo.
 *   6. 88–100% Chamada: a lente solta brilho de luar e o botão "Ver planos" acende em latão.
 * Com prefers-reduced-motion (ou sem JS) nada disso roda: a seção tem 1 tela e já mostra o estado final.
 */
export function HeroScene() {
  const root = useRef<HTMLElement>(null);

  useIsoLayoutEffect(() => {
    const el = root.current;
    if (!el || !document.documentElement.classList.contains("motion")) return;
    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      const q = gsap.utils.selector(el);
      const stage = q("[data-h=stage]")[0] as HTMLElement;
      const counter = q("[data-h=count]")[0] as HTMLElement;
      const scope = q("[data-h=scope]");
      const lens = q("[data-h=lens]");
      const cta = q("[data-h=cta]");
      const num = { v: 0 };
      counter.textContent = "0";

      // Posição "ao longe" da luneta, relativa ao centro da lente (recalculada no resize).
      // No celular o texto ocupa o topo, então ela começa à direita e um pouco abaixo dele.
      const narrow = () => stage.clientWidth < 640;
      const farX = () => stage.clientWidth * (narrow() ? 0.24 : 0.26);
      const farY = () => stage.clientHeight * (narrow() ? -0.02 : -0.22);
      gsap.set(scope, { xPercent: -50, yPercent: -50, x: farX, y: farY, rotation: -32, scale: 0.38, opacity: 1 });
      gsap.set(lens, { boxShadow: LENS_REST });

      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: el,
          start: "top top",
          end: "bottom bottom",
          scrub: 0.6,
          invalidateOnRefresh: true,
        },
      });

      // 1 → 2 · aproximação
      tl.to(q("[data-h=hint]"), { opacity: 0, y: 8, duration: 0.06 }, 0.02)
        .to(scope, { x: 0, y: 0, scale: 1, ease: "power2.out", duration: 0.23 }, 0.12)
        .to(q("[data-h=fog]"), { opacity: 0.55, scale: 1.25, duration: 0.23 }, 0.12)
        .to(q("[data-h=sites]"), { opacity: 0.9, filter: "blur(6px)", duration: 0.15 }, 0.14)
        .fromTo(q("[data-h=site]"), { y: -30 }, { y: 0, stagger: 0.03, duration: 0.2 }, 0.12)
        // 2 → 3 · extensão: os tubos deslizam e a objetiva vira moldura
        .to(q("[data-h=tube]"), { x: (i: number) => i * 18, stagger: 0.012, duration: 0.07, ease: "power1.out" }, 0.35)
        .to(scope, { scale: 1.9, opacity: 0, duration: 0.1, ease: "power1.in" }, 0.42)
        .to(lens, { scale: 1, opacity: 1, duration: 0.1, ease: "power2.out" }, 0.42)
        .to(q("[data-h=fog]"), { opacity: 0.22, scale: 1.5, duration: 0.15 }, 0.35)
        .to(q("[data-h=map]"), { opacity: 0.9, filter: "blur(2.5px)", duration: 0.08 }, 0.44)
        // 3 → 4 · foco
        .to(q("[data-h=map]"), { opacity: 1, filter: "blur(0px)", duration: 0.15 }, 0.52)
        .to(q("[data-h=map] [data-pin]"), { opacity: 1, stagger: 0.012, duration: 0.04 }, 0.55)
        .to(q("[data-h=sites]"), { opacity: 0.7, filter: "blur(0px)", duration: 0.15 }, 0.52)
        .to(q("[data-h=fog]"), { opacity: 0.08, scale: 1.8, duration: 0.15 }, 0.52)
        // 4 → 5 · mira travada
        .to(q("[data-h=reticle]"), { opacity: 1, duration: 0.03 }, 0.7)
        .fromTo(q("[data-h=reticle]"), { scale: 1.8 }, { scale: 1, duration: 0.05 }, 0.7)
        .fromTo(q("[data-h=reticle]"), { left: "50%", top: "50%" }, { left: SP_LEFT, top: SP_TOP, ease: "back.out(1.4)", duration: 0.1 }, 0.72)
        .fromTo(q("[data-h=reticle]"), { scale: 1.1 }, { scale: 1, duration: 0.02 }, 0.82)
        .to(q("[data-h=card]"), { opacity: 1, y: 0, duration: 0.06, ease: "power2.out" }, 0.8)
        .to(num, {
          v: ALVO_DESAGIO,
          duration: 0.08,
          ease: "expo.out",
          onUpdate: () => {
            counter.textContent = String(Math.round(num.v));
          },
        }, 0.81)
        // 5 → 6 · chamada
        .to(lens, { boxShadow: LENS_GLOW, duration: 0.08 }, 0.88)
        .to(cta, { boxShadow: CTA_GLOW, duration: 0.06 }, 0.9)
        .to(cta, { scale: 1.03, yoyo: true, repeat: 1, duration: 0.025 }, 0.93)
        .to({}, { duration: 0.02 }, 0.98);

      // Hover (mouse): o mapa desloca 2–4px e o retículo acompanha com inércia; sair recentra.
      if (matchMedia("(hover: hover) and (pointer: fine)").matches) {
        const lensEl = lens[0] as HTMLElement;
        const mx = gsap.quickTo(q("[data-h=map]"), "x", { duration: 0.6, ease: "power3" });
        const my = gsap.quickTo(q("[data-h=map]"), "y", { duration: 0.6, ease: "power3" });
        const onMove = (e: PointerEvent) => {
          const r = lensEl.getBoundingClientRect();
          mx(((e.clientX - r.left) / r.width - 0.5) * 8);
          my(((e.clientY - r.top) / r.height - 0.5) * 8);
        };
        const onLeave = () => {
          mx(0);
          my(0);
        };
        lensEl.addEventListener("pointermove", onMove);
        lensEl.addEventListener("pointerleave", onLeave);
        return () => {
          lensEl.removeEventListener("pointermove", onMove);
          lensEl.removeEventListener("pointerleave", onLeave);
        };
      }
    }, el);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={root} id="topo" aria-labelledby="hero-title" className="hero-track relative">
      <div data-h="stage" className="sticky top-0 h-svh overflow-hidden bg-noite [container-type:size]">
        {/* Céu: estrelas sutis e brilho de luar */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div
            className="absolute inset-0 animate-twinkle"
            style={{
              backgroundImage: [
                [8, 14, 1.5],
                [22, 62, 1],
                [37, 24, 1.2],
                [52, 86, 1],
                [64, 12, 1.6],
                [78, 44, 1],
                [88, 72, 1.3],
                [93, 22, 1],
                [45, 48, 1],
                [15, 88, 1.2],
                [70, 92, 1],
                [30, 40, 1],
                [58, 30, 1.1],
                [5, 50, 1],
              ]
                .map(([x, y, s]) => `radial-gradient(${s}px ${s}px at ${x}% ${y}%, rgba(var(--luar-rgb),.9), transparent 70%)`)
                .join(","),
            }}
          />
          <div className="absolute -top-[18cqh] -right-[10cqw] size-[60cqw] rounded-full bg-[radial-gradient(circle,rgba(var(--luar-rgb),0.10),transparent_60%)]" />

          {/* Sites dos leiloeiros (desfocados → nítidos) */}
          <div data-h="sites" className="absolute inset-0 max-sm:hidden">
            {SITES.map((s, i) => (
              <div
                key={i}
                data-h="site"
                className={`absolute rounded-lg border border-nevoa/25 bg-tinta p-2.5 ${s.pos}`}
              >
                <div className="h-2 w-3/5 rounded bg-nevoa/50" />
                <div className="mt-2.5 h-1.5 w-[85%] rounded bg-nevoa/25" />
                <div className="mt-1.5 h-1.5 w-[65%] rounded bg-nevoa/25" />
                {s.bar && <div className={`mt-2.5 h-1.5 w-2/5 rounded ${s.bar}`} />}
              </div>
            ))}
          </div>

          {/* Névoa */}
          <div
            data-h="fog"
            className="absolute -inset-[20%] [html:not(.motion)_&]:opacity-[0.08]"
            style={{
              background:
                "radial-gradient(ellipse 50% 40% at 30% 60%,rgba(var(--fog-rgb),.55),transparent 70%),radial-gradient(ellipse 45% 35% at 70% 40%,rgba(var(--fog-rgb),.45),transparent 70%),radial-gradient(ellipse 60% 30% at 50% 85%,rgba(var(--fog-rgb),.5),transparent 70%),radial-gradient(ellipse 40% 50% at 85% 75%,rgba(var(--fog-rgb),.35),transparent 70%)",
            }}
          />
        </div>

        {/* Centro da lente: 66%/50% no desktop, 50%/70% no celular */}
        <div aria-hidden="true" className="absolute top-[71%] left-1/2 sm:top-1/2 sm:left-[66%]">
          {/* Luneta de latão: ocular + 3 tubos + objetiva */}
          <div data-h="scope" className="absolute top-0 left-0 origin-center">
            <div className="flex items-center">
              <div data-h="tube" className="h-6 w-[18px] rounded" style={{ background: BRASS, boxShadow: "inset 0 0 0 1px rgba(90,68,20,.6)" }} />
              {[
                [96, 34],
                [84, 44],
                [72, 54],
              ].map(([w, h]) => (
                <div
                  key={w}
                  data-h="tube"
                  className="rounded-[3px] border-l-4 border-latao-escuro"
                  style={{ width: w, height: h, background: BRASS, boxShadow: "inset 0 0 0 1px rgba(90,68,20,.6)" }}
                />
              ))}
              <div
                data-h="tube"
                className="size-[66px] rounded-full border-[6px] border-latao"
                style={{
                  background: "radial-gradient(circle at 35% 35%,rgba(234,240,255,.9),#1C2A52 45%,#0F1830 70%)",
                  boxShadow: "0 0 0 2px #5A4414, inset 0 0 12px rgba(234,240,255,.3)",
                }}
              />
            </div>
          </div>
        </div>

        {/* Lente: moldura circular com anel de latão, mapa e retículo (fica noturna também no tema claro) */}
        <div
          data-h="lens"
          className="absolute top-[71%] left-1/2 size-[min(78cqw,40cqh)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full border-[6px] border-latao sm:top-1/2 sm:left-[66%] sm:size-[min(52cqw,62cqh)]"
          style={{
            background: "radial-gradient(circle at 50% 45%,#16224A,#0F1830 60%,#0A1226 100%)",
            boxShadow: LENS_GLOW,
          }}
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 rounded-full"
            style={{ boxShadow: "inset 0 0 0 10px #0F1830, inset 0 0 0 12px rgba(201,162,77,.55), inset 0 0 60px rgba(7,11,22,.9)" }}
          />
          <div aria-hidden="true" className="absolute inset-0 [background-size:11%_11%] [background-image:linear-gradient(rgba(142,155,181,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(142,155,181,.08)_1px,transparent_1px)]" />
          <div data-h="map" className="absolute inset-[7%]">
            <BrazilMap variant="lens" highlight="sp" label="Mapa do Brasil com os leilões monitorados; a mira está travada em São Paulo" />
            <div
              data-h="reticle"
              aria-hidden="true"
              className="absolute top-[69.475%] left-[66.9%] size-[clamp(48px,14cqmin,72px)] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-[#EAF0FF] shadow-[0_0_16px_rgba(234,240,255,.5)]"
            >
              <span className="absolute -top-2.5 left-1/2 h-5 w-[1.5px] -translate-x-1/2 bg-[#EAF0FF]" />
              <span className="absolute -bottom-2.5 left-1/2 h-5 w-[1.5px] -translate-x-1/2 bg-[#EAF0FF]" />
              <span className="absolute top-1/2 -left-2.5 h-[1.5px] w-5 -translate-y-1/2 bg-[#EAF0FF]" />
              <span className="absolute top-1/2 -right-2.5 h-[1.5px] w-5 -translate-y-1/2 bg-[#EAF0FF]" />
              <span className="absolute top-1/2 left-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#4ADE9A] shadow-[0_0_8px_#4ADE9A]" />
            </div>
          </div>
        </div>

        {/* Cartão do Alvo (exemplo fictício) */}
        <div
          data-h="card"
          className="absolute bottom-3 left-1/2 z-[4] flex w-[min(360px,calc(100cqw-32px))] -translate-x-1/2 items-center gap-3 rounded-2xl border border-latao/45 bg-tinta/95 p-3 pr-4 shadow-[0_20px_60px_rgba(0,0,0,.5)] backdrop-blur-md sm:bottom-[8cqh] sm:left-[min(calc(66%+4cqw),calc(100cqw-376px))] sm:translate-x-0"
        >
          <div
            aria-hidden="true"
            className="photo-placeholder flex size-14 shrink-0 items-center justify-center rounded-full border-[3px] border-latao font-mono text-[9px] text-nevoa"
          >
            foto
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.14em] text-pos uppercase">
              <Seal level={3} size={18} /> Alvo · exemplo
            </p>
            <p className="mt-1 text-[13px] leading-tight font-semibold text-luar">Apartamento 3 quartos · São Paulo/SP</p>
            <p className="mt-0.5 text-[11px] leading-tight text-nevoa">Desocupado · sem dívidas identificadas</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-display text-[30px] leading-none font-bold tracking-[-0.03em] text-pos">
              −<span data-h="count">{ALVO_DESAGIO}</span>%
            </p>
            <p className="mt-1 text-[10px] font-medium text-nevoa">deságio</p>
          </div>
        </div>

        {/* Texto: título, promessa e 2 botões */}
        <div className="absolute inset-x-0 top-0 z-[3] px-5 pt-[84px] sm:top-1/2 sm:w-[48%] sm:-translate-y-1/2 sm:px-[6cqw] sm:pt-9 lg:w-[44%]">
          <h1
            id="hero-title"
            className="font-display text-[clamp(32px,min(5.6cqw,8.5cqh),74px)] leading-[1.02] font-bold tracking-[-0.03em] text-luar max-sm:text-[clamp(30px,8.6cqw,40px)]"
          >
            {HERO.titleStart} <em className="accent text-latao-texto">{HERO.titleEm}</em> {HERO.titleEnd}
          </h1>
          <p className="mt-4 max-w-[460px] text-[clamp(15px,1.3cqw,19px)] leading-normal text-nevoa">{HERO.subtitle}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a data-h="cta" href="#planos" className="btn-primary">
              {HERO.primary}
            </a>
            <a href="#advogado" className="btn-ghost">
              {HERO.secondary}
            </a>
          </div>
          <p className="mt-5 text-xs leading-relaxed font-medium text-nevoa">
            <RichText text={HERO.trust} />
          </p>
        </div>

        {/* Dica de rolagem (some na etapa 2) */}
        <div
          data-h="hint"
          aria-hidden="true"
          className="absolute bottom-6 left-[6cqw] hidden items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-nevoa uppercase sm:flex [html:not(.motion)_&]:hidden"
        >
          <span className="relative h-8 w-5 rounded-full border border-nevoa/50">
            <span className="absolute top-1.5 left-1/2 h-1.5 w-[2px] -translate-x-1/2 animate-bounce rounded bg-latao" />
          </span>
          Role para mirar
        </div>
      </div>
    </section>
  );
}

"use client";

import { useEffect } from "react";
import { BRAZIL_PINS } from "@/lib/brazil";
import { whenIdle } from "@/lib/idle";
import { ALVO_DESAGIO, CTA_GLOW, LENS_GLOW, LENS_REST } from "./constants";

const [SP_X, SP_Y] = BRAZIL_PINS.sp;
const SP_LEFT = `${(SP_X / 400) * 100}%`;
const SP_TOP = `${(SP_Y / 400) * 100}%`;

/**
 * Ilha cliente do hero: monta o timeline GSAP ScrollTrigger sobre a marcação renderizada no servidor
 * (HeroScene). As 6 etapas estão descritas em HeroScene.tsx.
 */
export function HeroMotion() {
  useEffect(() => {
    const el = document.getElementById("topo");
    if (!el || !document.documentElement.classList.contains("motion")) return;
    // A etapa 1 já vem pronta do CSS (html.motion). O GSAP é baixado e montado quando o navegador
    // fica livre, para não competir com a primeira pintura e a hidratação.
    let ctx: { revert: () => void } | undefined;
    let cancelled = false;
    const cancelIdle = whenIdle(async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([import("gsap"), import("gsap/ScrollTrigger")]);
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);
      ctx = gsap.context(() => {
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
    });

    return () => {
      cancelled = true;
      cancelIdle();
      ctx?.revert();
    };
  }, []);


  return null;
}

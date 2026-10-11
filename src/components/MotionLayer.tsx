"use client";

import { useEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const fmt = (n: number, format?: string) => (format === "thousands" ? Math.round(n).toLocaleString("pt-BR") : String(Math.round(n)));

/**
 * Animações de apoio (todas leves), ligadas por atributos data-* nas seções server-side:
 *  - [data-reveal]        entrada suave: fade + y 24 → 0 (0.8s), uma vez, em lote (stagger 100ms).
 *  - [data-tags]         as tags de risco do cartão surgem uma a uma (stagger 70ms).
 *  - [data-count-to]      números contam até o valor final ao entrar (opcional data-count-from).
 *  - [data-seal-card]     os anéis dos selos são "desenhados" um a um (stroke-dashoffset, stagger 150ms).
 *  - [data-caution]       o anel de atenção pulsa 2× e as tags surgem uma a uma.
 *  - [data-draw-x]        a seta 1ª → 2ª praça se desenha (scaleX 0 → 1).
 *  - [data-slide-up]      o e-mail de alerta desliza de baixo com atraso.
 *  - [data-final-glow]    o brilho da chamada final cresce com a rolagem (scrub).
 *  - [data-pulse]         o botão pulsa 1× ao entrar.
 * Nada disso roda com prefers-reduced-motion: o conteúdo já está no estado final no HTML.
 */
export function MotionLayer() {
  useEffect(() => {
    if (!document.documentElement.classList.contains("motion")) return;
    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      // Entradas suaves
      const reveals = gsap.utils.toArray<HTMLElement>("[data-reveal]");
      gsap.set(reveals, { opacity: 0, y: 24 });
      ScrollTrigger.batch(reveals, {
        start: "top 88%",
        once: true,
        onEnter: (batch) =>
          gsap.to(batch, { opacity: 1, y: 0, duration: 0.8, ease: "power2.out", stagger: 0.1, overwrite: true, clearProps: "transform" }),
      });

      // Tags de risco surgem uma a uma quando o cartão aparece
      gsap.utils.toArray<HTMLElement>("[data-tags]").forEach((list) =>
        gsap.from(list.children, {
          opacity: 0,
          y: 6,
          duration: 0.4,
          stagger: 0.07,
          delay: 0.35,
          ease: "power2.out",
          scrollTrigger: { trigger: list, start: "top 92%", once: true },
        }),
      );

      // Contadores
      gsap.utils.toArray<HTMLElement>("[data-count-to]").forEach((el) => {
        const to = Number(el.dataset.countTo);
        const from = Number(el.dataset.countFrom ?? 0);
        const format = el.dataset.countFormat;
        const obj = { v: from };
        el.textContent = fmt(from, format);
        gsap.to(obj, {
          v: to,
          duration: 1.6,
          ease: "power3.out",
          scrollTrigger: { trigger: el, start: "top 85%", once: true },
          onUpdate: () => {
            el.textContent = fmt(obj.v, format);
          },
        });
      });

      // Selos: anéis desenhados em sequência (Promissor 1, Na Mira 2, Alvo 3)
      gsap.utils.toArray<HTMLElement>("[data-seal-card]").forEach((card) => {
        const rings = card.querySelectorAll<SVGCircleElement>("[data-seal] [data-ring]");
        rings.forEach((r) => {
          const len = 2 * Math.PI * Number(r.getAttribute("r"));
          gsap.set(r, { strokeDasharray: len, strokeDashoffset: len });
        });
        gsap.to(rings, {
          strokeDashoffset: 0,
          duration: 0.9,
          ease: "power2.inOut",
          stagger: 0.15,
          delay: 0.3,
          scrollTrigger: { trigger: card, start: "top 85%", once: true },
        });
      });

      // Bloco "Cuidado": anel âmbar pulsa 2× e as tags entram em cascata
      gsap.utils.toArray<HTMLElement>("[data-caution]").forEach((box) => {
        const tl = gsap.timeline({ scrollTrigger: { trigger: box, start: "top 75%", once: true } });
        tl.to(box.querySelector("[data-caution-ring]"), { scale: 1.12, duration: 0.25, yoyo: true, repeat: 3, ease: "power1.inOut" }, 0.3).from(
          box.querySelectorAll("[data-tag]"),
          { opacity: 0, y: 8, stagger: 0.12, duration: 0.4, ease: "power2.out" },
          0.3,
        );
      });

      gsap.utils.toArray<HTMLElement>("[data-draw-x]").forEach((el) =>
        gsap.from(el, { scaleX: 0, duration: 0.6, ease: "power2.out", scrollTrigger: { trigger: el, start: "top 85%", once: true } }),
      );
      gsap.utils.toArray<HTMLElement>("[data-slide-up]").forEach((el) =>
        gsap.from(el, { opacity: 0, y: 16, duration: 0.6, delay: 0.3, ease: "power2.out", scrollTrigger: { trigger: el, start: "top 90%", once: true } }),
      );
      gsap.utils.toArray<HTMLElement>("[data-final-glow]").forEach((el) =>
        gsap.fromTo(el, { scale: 0.8 }, { scale: 1.1, ease: "none", scrollTrigger: { trigger: el.parentElement, start: "top bottom", end: "bottom top", scrub: true } }),
      );
      gsap.utils.toArray<HTMLElement>("[data-pulse]").forEach((el) =>
        gsap.to(el, { scale: 1.04, yoyo: true, repeat: 1, duration: 0.3, delay: 0.6, ease: "power1.inOut", scrollTrigger: { trigger: el, start: "top 85%", once: true } }),
      );
    });

    // Fontes e imagens mudam alturas: recalcula os gatilhos quando tudo carregar.
    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener("load", refresh);
    document.fonts?.ready.then(refresh);
    return () => {
      window.removeEventListener("load", refresh);
      ctx.revert();
    };
  }, []);

  return null;
}

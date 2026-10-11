"use client";

import { useEffect } from "react";

const SELECTOR = "[data-reveal],[data-seal-card],[data-caution],[data-tags],[data-draw-x],[data-slide-up],[data-pulse],[data-count-to]";

const fmt = (n: number, format?: string) => (format === "thousands" ? Math.round(n).toLocaleString("pt-BR") : String(Math.round(n)));

function countUp(el: HTMLElement) {
  const to = Number(el.dataset.countTo);
  const from = Number(el.dataset.countFrom ?? 0);
  const format = el.dataset.countFormat;
  const t0 = performance.now();
  const tick = (t: number) => {
    const p = Math.min(1, (t - t0) / 1600);
    const e = 1 - Math.pow(1 - p, 3); // ease cubic.out
    el.textContent = fmt(from + (to - from) * e, format);
    if (p < 1) requestAnimationFrame(tick);
  };
  el.textContent = fmt(from, format);
  requestAnimationFrame(tick);
}

/**
 * Animações de apoio (todas leves). As seções são renderizadas no servidor e marcam o que anima com
 * data-*; aqui um único IntersectionObserver põe a classe .is-in quando o bloco entra na tela e o CSS
 * (globals.css → "Animações de apoio") faz o resto com transições de opacity/transform:
 *  - [data-reveal]     entrada suave: fade + y 24 → 0 (0.8s), em cascata quando entram juntos.
 *  - [data-seal-card]  os anéis dos selos são "desenhados" um a um (stroke-dashoffset, 150ms entre eles).
 *  - [data-caution]    o anel de atenção pulsa 2× e as tags surgem uma a uma.
 *  - [data-tags]       as tags de risco do cartão surgem uma a uma (70ms).
 *  - [data-draw-x]     a seta 1ª → 2ª praça se desenha (scaleX 0 → 1).
 *  - [data-slide-up]   o e-mail de alerta desliza de baixo com atraso.
 *  - [data-pulse]      o botão pulsa 1× ao entrar.
 *  - [data-count-to]   números contam até o valor final (opcional data-count-from).
 * O brilho da chamada final cresce com a rolagem via CSS scroll-driven animation.
 * O GSAP ScrollTrigger fica reservado para a cena do hero (HeroMotion).
 * Com prefers-reduced-motion nada disso roda: o HTML já está no estado final.
 */
export function MotionLayer() {
  useEffect(() => {
    const root = document.documentElement;
    if (!root.classList.contains("motion") || !("IntersectionObserver" in window)) return;

    const els = Array.from(document.querySelectorAll<HTMLElement>(SELECTOR));
    // O que já está na tela ao montar entra direto, sem piscar.
    const vh = window.innerHeight;
    els.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < vh && r.bottom > 0) el.classList.add("is-in");
    });
    root.classList.add("reveal-ready");

    const io = new IntersectionObserver(
      (entries) => {
        let n = 0;
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const el = e.target as HTMLElement;
          if (el.hasAttribute("data-reveal")) el.style.setProperty("--stagger", `${n++ * 100}ms`);
          el.classList.add("is-in");
          if (el.dataset.countTo) countUp(el);
          io.unobserve(el);
        });
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    els.forEach((el) => !el.classList.contains("is-in") && io.observe(el));

    return () => {
      io.disconnect();
      root.classList.remove("reveal-ready");
    };
  }, []);

  return null;
}

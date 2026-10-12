"use client";

import { useEffect, useState } from "react";

type Zone = "hero" | "plans" | "form";

/**
 * Barra fixa de CTA no celular ("Ver planos"), só abaixo de md. Entra (y 80 → 0) quando o hero já saiu
 * quase todo da tela e some enquanto os cartões de plano estão na tela (lá "Ver planos" só repetiria o que já
 * está à vista) e perto do formulário final, para não cobri-lo. Tudo por IntersectionObserver, sem ouvir a rolagem.
 * Oculta, fica inert: sai do Tab e do leitor de tela.
 * Enquanto ela existe, html[data-cta-bar] reserva o espaço dela no pé da tela (scroll-padding-bottom em
 * globals.css): o item focado e o alvo de um link interno param acima da barra.
 */
export function MobileCtaBar() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.ctaBar = "";
    // Zonas onde a barra não aparece; cada uma "ativa" enquanto o alvo cruza a faixa da tela dada pela margem.
    const active: Record<Zone, boolean> = { hero: true, plans: false, form: false };
    const watch = (zone: Zone, el: Element | null, rootMargin: string) => {
      if (!el) {
        active[zone] = false;
        return null;
      }
      const io = new IntersectionObserver(
        (entries) => {
          active[zone] = entries[entries.length - 1].isIntersecting;
          setVisible(!active.hero && !active.plans && !active.form);
        },
        { rootMargin },
      );
      io.observe(el);
      return io;
    };
    const observers = [
      // hero: ativo até o fim dele subir acima de 40% da altura da tela (≈ 60% de uma tela rolada)
      watch("hero", document.getElementById("topo"), "-40% 0px 0px 0px"),
      // cartões de plano: qualquer pedaço deles visível abaixo do menu fixo (56px)
      watch("plans", document.querySelector("[data-plan-cards]"), "-56px 0px 0px 0px"),
      // formulário: a partir do momento em que passa de 80% da altura da tela
      watch("form", document.getElementById("comecar"), "0px 0px -20% 0px"),
    ];
    return () => {
      observers.forEach((io) => io?.disconnect());
      delete root.dataset.ctaBar;
    };
  }, []);

  return (
    <nav
      aria-label="Atalhos"
      inert={!visible}
      className={`fixed inset-x-4 bottom-4 z-40 flex gap-2.5 rounded-full border border-latao/40 bg-tinta/90 p-2.5 shadow-[0_10px_40px_rgba(0,0,0,0.5)] backdrop-blur-md transition-[transform,opacity] duration-500 ease-luneta md:hidden ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-20 opacity-0"
      }`}
      style={{ paddingBottom: "max(10px, env(safe-area-inset-bottom))" }}
    >
      <a href="#planos" className="btn-primary flex-1">
        Ver planos
      </a>
      <a
        href="#advogado"
        className="inline-flex min-h-12 items-center justify-center rounded-full px-4 text-sm font-medium text-luar no-underline"
      >
        Advogado
      </a>
    </nav>
  );
}

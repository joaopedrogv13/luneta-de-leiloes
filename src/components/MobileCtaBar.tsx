"use client";

import { useEffect, useState } from "react";

/**
 * Barra fixa de CTA no celular ("Ver planos"). Entra (y 80 → 0) depois que o visitante começa a rolar
 * a cena do hero e some quando o formulário final está na tela, para não cobri-lo.
 */
export function MobileCtaBar() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const form = document.getElementById("comecar");
    let formInView = false;
    const update = () => setVisible(window.scrollY > window.innerHeight * 0.6 && !formInView);
    const io = form
      ? new IntersectionObserver(([e]) => {
          formInView = e.isIntersecting;
          update();
        }, { rootMargin: "0px 0px -20% 0px" })
      : null;
    if (form && io) io.observe(form);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      window.removeEventListener("scroll", update);
      io?.disconnect();
    };
  }, []);

  return (
    <div
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
    </div>
  );
}

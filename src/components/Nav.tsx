"use client";

import { useEffect, useState } from "react";
import { NAV_LINKS } from "@/content/site";
import { Logo } from "@/components/ui/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * Menu mínimo (Como funciona, Níveis, Planos, Falar com advogado) com âncoras que deslizam até a seção.
 * Ao rolar > 64px a barra encolhe (64 → 56) e ganha borda. No celular, os links ficam num menu recolhível.
 */
export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 64);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 border-b backdrop-blur-md transition-[height,background-color,border-color] duration-300 ${
        scrolled ? "h-14 border-nevoa/20 bg-noite/85" : "h-16 border-transparent bg-noite/70"
      }`}
    >
      <nav aria-label="Principal" className="mx-auto flex h-full max-w-[1280px] items-center justify-between gap-4 px-4 sm:px-8">
        <a href="#topo" className="rounded-md text-luar no-underline" aria-label="Luneta de Leilões, voltar ao topo">
          <Logo />
        </a>

        <ul className="hidden items-center gap-7 text-sm font-medium lg:flex">
          {NAV_LINKS.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className="group relative whitespace-nowrap py-2 text-nevoa no-underline transition-colors hover:text-luar"
              >
                {l.label}
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 -bottom-0.5 h-px origin-left scale-x-0 bg-latao transition-transform duration-300 ease-luneta group-hover:scale-x-100"
                />
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <a href="#planos" className="btn-primary hidden !min-h-10 !px-4 !text-[13px] sm:inline-flex">
            Ver planos
          </a>
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-full border border-nevoa/40 px-3.5 text-[13px] font-medium text-luar lg:hidden"
            aria-expanded={open}
            aria-controls="menu-mobile"
            onClick={() => setOpen((v) => !v)}
          >
            <span aria-hidden="true" className="flex w-3.5 flex-col gap-[3px]">
              <span className={`h-[1.5px] bg-current transition-transform ${open ? "translate-y-[4.5px] rotate-45" : ""}`} />
              <span className={`h-[1.5px] bg-current transition-opacity ${open ? "opacity-0" : ""}`} />
              <span className={`h-[1.5px] bg-current transition-transform ${open ? "-translate-y-[4.5px] -rotate-45" : ""}`} />
            </span>
            Menu
          </button>
        </div>
      </nav>

      <div
        id="menu-mobile"
        hidden={!open}
        className="border-b border-nevoa/20 bg-noite/95 px-4 pb-4 backdrop-blur-md lg:hidden"
      >
        <ul className="flex flex-col">
          {NAV_LINKS.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                onClick={() => setOpen(false)}
                className="block border-t border-nevoa/15 py-3.5 text-base font-medium text-luar no-underline"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </header>
  );
}

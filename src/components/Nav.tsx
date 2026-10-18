"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { NAV_LINKS, SUBSCRIBER_AREA } from "@/content/site";
import { Logo } from "@/components/ui/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * Menu mínimo (Como funciona, Níveis, Ferramentas, Planos, Falar com advogado) com âncoras que deslizam até a seção.
 * Ao rolar > 64px a barra encolhe (64 → 56) e ganha borda. No celular, os links ficam num menu recolhível.
 * `base`: fora da landing (ex.: a página do método da nota, "/"), as âncoras levam às seções da home ("/#planos").
 */
export function Nav({ base = "" }: { base?: string } = {}) {
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
      // No topo (sobre a cena animada do hero) a barra não desfoca o fundo: o desfoque seria refeito a cada
      // quadro. Ele entra quando a página rola.
      className={`fixed inset-x-0 top-0 z-50 border-b transition-[height,background-color,border-color] duration-300 ${
        scrolled ? "h-14 border-nevoa/20 bg-noite/85 backdrop-blur-md" : "h-16 border-transparent bg-noite/75"
      }`}
    >
      <nav aria-label="Principal" className="mx-auto flex h-full max-w-[1280px] items-center justify-between gap-4 px-4 sm:px-8">
        <a href={base ? "/" : "#topo"} className="rounded-md text-luar no-underline" aria-label={base ? "Luneta de Leilões, página inicial" : "Luneta de Leilões, voltar ao topo"}>
          <Logo />
        </a>

        <ul className="hidden items-center gap-7 text-sm font-medium lg:flex">
          {NAV_LINKS.map((l) => (
            // `largo`: só a partir de 1280 px (entre 1024 e 1279 não cabe ao lado dos botões); no menu do celular, sempre
            <li key={l.href} className={l.largo ? "hidden xl:block" : undefined}>
              <a
                href={`${base}${l.href}`}
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
          <Link
            href={SUBSCRIBER_AREA.href}
            className="hidden h-10 items-center gap-2 rounded-full border border-latao/60 px-4 text-[13px] font-semibold whitespace-nowrap text-latao-texto no-underline transition-colors hover:bg-latao/10 hover:text-luar lg:inline-flex"
          >
            <span aria-hidden="true" className="size-3 rounded-full border-[1.5px] border-current" />
            {SUBSCRIBER_AREA.label}
          </Link>
          <a href={`${base}#planos`} className="btn-primary hidden !min-h-10 !px-4 !text-[13px] sm:inline-flex">
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
                href={`${base}${l.href}`}
                onClick={() => setOpen(false)}
                className="block border-t border-nevoa/15 py-3.5 text-base font-medium text-luar no-underline"
              >
                {l.label}
              </a>
            </li>
          ))}
          <li>
            <Link
              href={SUBSCRIBER_AREA.href}
              onClick={() => setOpen(false)}
              className="mt-1 flex items-center justify-between border-t border-nevoa/15 py-3.5 text-base font-semibold text-latao-texto no-underline"
            >
              {SUBSCRIBER_AREA.label}
              <span className="text-xs font-medium text-nevoa">demonstração →</span>
            </Link>
          </li>
        </ul>
      </div>
    </header>
  );
}

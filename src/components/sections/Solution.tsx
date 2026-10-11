import type { ReactNode } from "react";
import { SOLUTION } from "@/content/site";
import { SectionHeading } from "@/components/ui/Heading";

const ICONS: Record<(typeof SOLUTION.cards)[number]["icon"], ReactNode> = {
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.1 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.1-3.6-8.5S9.6 5.8 12 3.5z" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  filter: <path d="M4 6h16M7 12h10M10 18h4" />,
  check: (
    <>
      <path d="M5 12.5l4.2 4.2L19 7" />
    </>
  ),
};

export function Solution({ children }: { children?: ReactNode }) {
  return (
    <section aria-labelledby="solucao-titulo" className="section">
      <div className="container-l">
        <SectionHeading id="solucao-titulo" eyebrow={SOLUTION.eyebrow} parts={SOLUTION.title} className="max-w-[820px]" />
        <ul data-stagger className="mt-10 grid gap-4 sm:grid-cols-2 sm:mt-16 lg:grid-cols-4">
          {SOLUTION.cards.map((c) => (
            <li
              key={c.title}
              data-reveal
              className="group card p-7 transition-[border-color,transform] duration-200 hover:-translate-y-[3px] hover:border-latao/50"
            >
              <span className="flex size-11 items-center justify-center rounded-full border-[1.5px] border-latao text-latao-texto">
                <svg
                  viewBox="0 0 24 24"
                  className="size-5 transition-transform duration-300 group-hover:rotate-[10deg]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {ICONS[c.icon]}
                </svg>
              </span>
              <h3 className="mt-6 font-display text-xl leading-tight font-bold tracking-[-0.01em]">{c.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-nevoa">{c.text}</p>
            </li>
          ))}
        </ul>
        {children}
      </div>
    </section>
  );
}

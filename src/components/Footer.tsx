import Link from "next/link";
import { FOOTER, NAV_LINKS, SITE, SUBSCRIBER_AREA } from "@/content/site";
import { Logo } from "@/components/ui/Logo";
import { RichText } from "@/components/ui/RichText";

/** Rodapé com avisos legais (a classificação não é garantia; LGPD; preços podem mudar). */
export function Footer() {
  return (
    <footer className="border-t border-nevoa/15 bg-noite px-5 pt-14 pb-32 sm:px-10 md:pb-16">
      <div className="container-l grid gap-10 md:grid-cols-[1.1fr_0.7fr_1.6fr]">
        <div>
          <Logo />
          <p className="mt-3 font-serif text-lg italic text-nevoa">{SITE.slogan}</p>
        </div>
        <nav aria-label="Rodapé">
          <ul className="flex flex-col gap-1 text-sm font-medium">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="inline-block py-1.5 text-nevoa no-underline hover:text-luar">
                  {l.label}
                </a>
              </li>
            ))}
            <li>
              <Link href={SUBSCRIBER_AREA.href} className="inline-block py-1.5 text-nevoa no-underline hover:text-luar">
                {SUBSCRIBER_AREA.label} (demonstração)
              </Link>
            </li>
            <li>
              <a href="#politica-de-privacidade" className="inline-block py-1.5 text-nevoa no-underline hover:text-luar">
                Política de privacidade <RichText text="[link]" />
              </a>
            </li>
            <li>
              <a href="#termos-de-uso" className="inline-block py-1.5 text-nevoa no-underline hover:text-luar">
                Termos de uso <RichText text="[link]" />
              </a>
            </li>
          </ul>
        </nav>
        <div className="text-[13px] leading-relaxed text-nevoa">
          <p>
            <strong className="font-semibold text-luar">Aviso:</strong> {FOOTER.legal}
          </p>
          <p className="mt-4">
            © 2026 {SITE.name}. <RichText text={FOOTER.company} />
          </p>
        </div>
      </div>
    </footer>
  );
}

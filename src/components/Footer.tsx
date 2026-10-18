import Link from "next/link";
import { FOOTER, NAV_LINKS, SITE, SUBSCRIBER_AREA } from "@/content/site";
import { Logo } from "@/components/ui/Logo";
import { RichText } from "@/components/ui/RichText";

/**
 * Rodapé com avisos legais (a classificação não é garantia; LGPD; preços podem mudar). `base`: fora da landing, as
 * âncoras levam às seções da home ("/#planos").
 * Abaixo de md, o respiro de baixo nunca é menor que a faixa da barra de atalhos (--cta-bar-space, que cresce
 * com a área segura): no fim da página o texto fica acima dela.
 */
export function Footer({ base = "" }: { base?: string } = {}) {
  return (
    <footer className="border-t border-nevoa/15 bg-noite px-5 pt-14 pb-[max(8rem,var(--cta-bar-space))] sm:px-10 md:pb-16">
      <div className="container-l grid gap-10 md:grid-cols-[1.1fr_0.7fr_1.6fr]">
        <div>
          <Logo />
          <p className="mt-3 font-serif text-lg italic text-nevoa">{SITE.slogan}</p>
        </div>
        <nav aria-label="Rodapé">
          <ul className="flex flex-col gap-1 text-sm font-medium">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <a href={`${base}${l.href}`} className="inline-block py-1.5 text-nevoa no-underline hover:text-luar">
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
              <a href={`${base}#politica-de-privacidade`} className="inline-block py-1.5 text-nevoa no-underline hover:text-luar">
                Política de privacidade <RichText text="[link]" />
              </a>
            </li>
            <li>
              <a href={`${base}#termos-de-uso`} className="inline-block py-1.5 text-nevoa no-underline hover:text-luar">
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

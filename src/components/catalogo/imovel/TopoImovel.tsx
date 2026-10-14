import Link from "next/link";
import { BACK_TO_SITE } from "@/components/assinante/shared";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogoMark } from "@/components/ui/Logo";
import { rotaImovel } from "@/lib/catalogo/rotas";
import type { Conjunto, Plano } from "@/lib/catalogo/tipos";

const PLANOS: { id: Plano; rotulo: string }[] = [
  { id: "lente", rotulo: "Lente" },
  { id: "luneta", rotulo: "Luneta" },
];

/** Altura do cabeçalho fixo (a navegação das seções e o resumo lateral colam logo abaixo). */
export const ALTURA_TOPO = "h-14 sm:h-16";

/**
 * Faixa da prévia ou da demonstração e o cabeçalho fixo da página do imóvel: logo (volta ao site),
 * "Ver como: Lente | Luneta" (a mesma página no outro plano), tema e o convite ao plano Luneta.
 */
export function TopoImovel({ conjunto, plano, id }: { conjunto: Conjunto; plano: Plano; id: string }) {
  const faixa =
    conjunto === "previa"
      ? "Prévia interna com dados reais · classificação automática ainda sem revisão humana · selos desligados"
      : "Demonstração com exemplos fictícios · sem login";
  return (
    <>
      <a
        href="#conteudo"
        className="fixed top-2 left-2 z-[100] -translate-y-20 rounded-full bg-latao px-4 py-2 text-sm font-semibold text-noite-fixa focus:translate-y-0 focus-visible:outline-noite-fixa"
      >
        Pular para o conteúdo
      </a>
      <aside
        aria-label={conjunto === "previa" ? "Aviso de prévia interna" : "Aviso de demonstração"}
        className="bg-latao px-4 py-1.5 text-center text-[12px] leading-snug font-semibold text-noite-fixa sm:text-[13px]"
      >
        <p>{faixa}</p>
      </aside>
      <header className="sticky top-0 z-40 border-b border-nevoa/15 bg-noite/90 backdrop-blur-md supports-[not(backdrop-filter:blur(1px))]:bg-noite">
        <div className={`mx-auto flex max-w-[1280px] items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8 ${ALTURA_TOPO}`}>
          <Link
            href={BACK_TO_SITE}
            aria-label="Luneta de Leilões, voltar ao site"
            className="mr-auto inline-flex min-h-11 items-center gap-2.5 rounded-md font-display text-base leading-none font-bold tracking-[-0.01em] whitespace-nowrap text-luar no-underline"
          >
            <LogoMark />
            <span>Luneta</span>
          </Link>

          <div role="group" aria-label="Ver como" className="inline-flex items-center rounded-full border border-nevoa/25 bg-tinta p-0.5">
            <span aria-hidden="true" className="hidden pr-2 pl-2.5 text-[10px] leading-none font-medium tracking-[0.12em] whitespace-nowrap text-nevoa uppercase md:inline">
              Ver como
            </span>
            {PLANOS.map((p) => {
              const ativo = p.id === plano;
              return (
                <Link
                  key={p.id}
                  href={rotaImovel(conjunto, id, p.id)}
                  replace
                  scroll={false}
                  prefetch={false}
                  aria-current={ativo ? "page" : undefined}
                  className={`inline-flex min-h-11 items-center rounded-full px-3 text-xs font-semibold no-underline transition-[background-color,color] duration-200 sm:px-3.5 pointer-fine:min-h-9 ${
                    ativo ? "bg-latao text-noite-fixa" : "text-nevoa hover:text-luar"
                  }`}
                >
                  {p.rotulo}
                </Link>
              );
            })}
          </div>

          <ThemeToggle />

          <Link href={BACK_TO_SITE} className="btn-outline hidden min-h-10! px-4! text-[13px]! md:inline-flex">
            Plano Luneta
          </Link>
        </div>
      </header>
    </>
  );
}

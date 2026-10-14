import Link from "next/link";
import { BACK_TO_SITE } from "@/components/assinante/shared";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogoMark } from "@/components/ui/Logo";
import type { Conjunto, Plano } from "@/lib/catalogo/tipos";
import { TrocaPlano } from "./TrocaPlano";

/** Altura do cabeçalho fixo (a navegação das seções e o resumo lateral colam logo abaixo; com pouca altura, ele não é fixo). */
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
      {/* celular deitado (pouca altura): o cabeçalho rola junto e a navegação das seções cola no topo */}
      <header className="sticky top-0 z-40 [@media(max-height:500px)]:static border-b border-nevoa/15 bg-noite/90 backdrop-blur-md supports-[not(backdrop-filter:blur(1px))]:bg-noite">
        <div className={`mx-auto flex max-w-[1280px] items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8 ${ALTURA_TOPO}`}>
          <Link
            href={BACK_TO_SITE}
            prefetch={false}
            aria-label="Luneta de Leilões, voltar ao site"
            className="mr-auto inline-flex min-h-11 items-center gap-2.5 rounded-md font-display text-base leading-none font-bold tracking-[-0.01em] whitespace-nowrap text-luar no-underline"
          >
            <LogoMark />
            <span>Luneta</span>
          </Link>

          <TrocaPlano conjunto={conjunto} plano={plano} id={id} />

          <ThemeToggle />

          <Link href={BACK_TO_SITE} prefetch={false} className="btn-outline hidden min-h-10! px-4! text-[13px]! md:inline-flex">
            Plano Luneta
          </Link>
        </div>
      </header>
    </>
  );
}

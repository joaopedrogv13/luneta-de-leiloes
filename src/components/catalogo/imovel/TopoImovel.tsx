import Link from "next/link";
import { BACK_TO_SITE } from "@/components/assinante/shared";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogoMark } from "@/components/ui/Logo";
import type { Conjunto, Plano } from "@/lib/catalogo/tipos";
import { TopoRecolhivel } from "./TopoRecolhivel";
import { TrocaPlano } from "./TrocaPlano";
import { VoltarBusca } from "./VoltarBusca";

/** Altura do cabeçalho fixo (a navegação das seções e o resumo lateral colam logo abaixo; com pouca altura, ele não é fixo). */
export const ALTURA_TOPO = "h-14 sm:h-16";

/**
 * Faixa da prévia ou da demonstração e o cabeçalho fixo da página do imóvel: no celular, "← voltar à busca"
 * (ícone); logo (volta ao site), "Ver como: Lente | Luneta" (a mesma página no outro plano), tema e o convite ao
 * plano Luneta. No celular e no tablet ele sai de cena ao rolar para baixo (TopoRecolhivel).
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
        {/* tela baixa: numa linha só */}
        <p className="baixa:truncate">{faixa}</p>
      </aside>
      {/* celular deitado (pouca altura): o cabeçalho rola junto e a navegação das seções cola no topo. Celular e
          tablet: sai de cena ao rolar para baixo e volta ao rolar para cima (TopoRecolhivel marca o <html>) */}
      <header
        data-topo-imovel=""
        className="sticky top-0 z-40 border-b border-nevoa/15 bg-noite/90 backdrop-blur-md transition-transform duration-200 ease-luneta supports-[not(backdrop-filter:blur(1px))]:bg-noite motion-reduce:transition-none baixa:static [html[data-topo-recolhido]_&]:-translate-y-full"
      >
        <div className={`mx-auto flex max-w-[1280px] items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8 2xl:max-w-[1440px] ${ALTURA_TOPO}`}>
          {/* celular: "voltar à busca" vira um ícone aqui (a linha própria, acima da galeria, ocupava ~56 px) */}
          <VoltarBusca conjunto={conjunto} plano={plano} icone className="-ml-1.5 sm:hidden baixa:grid" />
          <Link
            href={BACK_TO_SITE}
            prefetch={false}
            aria-label="Luneta de Leilões, voltar ao site"
            // abaixo de 380 px só o logo fica à vista: o alvo continua com 44 px de largura
            className="mr-auto inline-flex min-h-11 items-center gap-2.5 rounded-md font-display text-base leading-none font-bold tracking-[-0.01em] whitespace-nowrap text-luar no-underline max-[379px]:min-w-11 max-[379px]:justify-center"
          >
            <LogoMark />
            <span className="max-[379px]:sr-only">Luneta</span>
          </Link>

          <TrocaPlano conjunto={conjunto} plano={plano} id={id} />

          <ThemeToggle />

          <Link href={BACK_TO_SITE} prefetch={false} className="btn-outline hidden min-h-11! px-4! text-[13px]! md:inline-flex pointer-fine:min-h-10!">
            Plano Luneta
          </Link>
        </div>
      </header>
      <TopoRecolhivel />
    </>
  );
}

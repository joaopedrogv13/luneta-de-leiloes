import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/content/site";
import { AssinanteApp } from "@/components/assinante/AssinanteApp";
import { BACK_TO_SITE, type ListOrigin, type Plan } from "@/components/assinante/shared";
import { ATIVOS_POR_UF, FAIXA_PREVIA, RESUMO_BANCO, imoveisDaPrevia } from "@/lib/previa";

const TITLE = "Prévia interna com dados reais | Luneta de Leilões";
const DESCRIPTION =
  "Prévia interna da área do assinante com imóveis reais da Caixa e da Leilões Judiciais, classificação automática ainda não revisada.";

// Página interna: fora dos buscadores (noindex, nofollow em qualquer ambiente), fora do sitemap e sem link no menu.
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  robots: { index: false, follow: false },
  alternates: { canonical: "/previa" },
  openGraph: {
    type: "website",
    locale: SITE.locale,
    url: "/previa",
    siteName: SITE.name,
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary",
    title: TITLE,
    description: DESCRIPTION,
  },
};

const ORIGEM: ListOrigin = {
  one: "imóvel",
  other: "imóveis",
  subtitle: "prévia com dados reais",
  listLabel: "Imóveis reais da base, por maior deságio",
  note: `Amostra de ${RESUMO_BANCO.amostra} imóveis reais do banco, escolhidos para variar fonte, modalidade, risco, UF e tipo. Preços, praças e datas mudam: confira sempre o edital no site da fonte.`,
  emptyNote: `Esta prévia mostra só ${RESUMO_BANCO.amostra} dos ${RESUMO_BANCO.ativos} imóveis do banco: uma cidade pode estar no banco e fora da amostra.`,
};

const AVISO =
  "A classificação não é garantia: é uma análise automática dos dados publicados pela fonte, ainda sem revisão humana, e não substitui a leitura do edital nem a avaliação de um advogado.";

/**
 * Prévia da fase 1 · INTERNA (só pelo endereço): a mesma experiência da /assinante (lista, filtros, mapa,
 * detalhe, Lente × Luneta) com o instantâneo do banco em base/saida. Guia de produção: base/FASE1-SITE.md.
 * O plano (?plano=lente) é decidido aqui, no servidor, e no Lente a lista já sai sem tags: trocar de plano
 * pede a página de novo (planOnServer).
 */
export default async function PreviaPage({ searchParams }: PageProps<"/previa">) {
  const { plano } = await searchParams;
  const initialPlan: Plan = plano === "lente" ? "lente" : "luneta";

  return (
    <>
      <a
        href="#conteudo"
        className="fixed top-2 left-2 z-[70] -translate-y-20 rounded-full bg-latao px-4 py-2 text-sm font-semibold text-noite-fixa focus:translate-y-0 focus-visible:outline-noite-fixa"
      >
        Pular para a lista
      </a>

      <aside
        aria-label="Aviso de prévia interna"
        className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-latao px-4 py-2 text-center text-[13px] leading-snug font-semibold text-noite-fixa"
      >
        <p className="max-w-[110ch]">{FAIXA_PREVIA}</p>
        <Link
          href={BACK_TO_SITE}
          className="inline-flex min-h-11 pointer-fine:min-h-8 items-center rounded-full underline decoration-noite-fixa/50 underline-offset-[3px] hover:decoration-noite-fixa focus-visible:outline-noite-fixa"
        >
          <span aria-hidden="true">←&nbsp;</span>Voltar ao site
        </Link>
      </aside>

      {/* sem <h2>: o <h1> da página vem depois, no <main> do app */}
      <section aria-labelledby="resumo-banco" className="border-b border-nevoa/15 bg-tinta px-4 py-4 sm:px-6 lg:px-8">
        <p id="resumo-banco" className="text-[10px] leading-none font-semibold tracking-[0.14em] text-nevoa uppercase">
          Resumo do banco inteiro, não só desta amostra
        </p>
        <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-3 text-[13px] leading-snug">
          <div>
            <dt className="text-nevoa">Imóveis ativos</dt>
            <dd className="mt-0.5 font-display text-lg leading-tight font-bold text-luar tabular-nums">{RESUMO_BANCO.ativos}</dd>
          </div>
          <div>
            <dt className="text-nevoa">5 UFs com mais imóveis</dt>
            <dd className="mt-1 flex flex-wrap gap-x-2.5 gap-y-1 font-semibold text-luar tabular-nums">
              {RESUMO_BANCO.maioresUfs.map((u) => (
                <span key={u.uf} className="whitespace-nowrap">
                  {u.uf} <span className="font-normal text-nevoa">{u.ativos}</span>
                </span>
              ))}
            </dd>
            <dd className="mt-1.5">
              <details className="group">
                <summary className="inline-flex min-h-11 cursor-pointer items-center text-xs font-medium text-latao-texto underline-offset-4 hover:underline pointer-fine:min-h-6">
                  {`Ver as ${RESUMO_BANCO.todasUfs.length} UFs`}
                </summary>
                <p className="mt-1 flex max-w-[72ch] flex-wrap gap-x-2.5 gap-y-1 font-semibold text-luar tabular-nums">
                  {RESUMO_BANCO.todasUfs.map((u) => (
                    <span key={u.uf} className="whitespace-nowrap">
                      {u.uf} <span className="font-normal text-nevoa">{u.ativos}</span>
                    </span>
                  ))}
                </p>
              </details>
            </dd>
          </div>
          <div>
            <dt className="text-nevoa">Deságio mediano</dt>
            <dd className="mt-0.5 font-display text-lg leading-tight font-bold text-luar tabular-nums">{RESUMO_BANCO.desagioMediano}</dd>
          </div>
          <div>
            <dt className="text-nevoa">Aceitam financiamento</dt>
            <dd className="mt-0.5 font-display text-lg leading-tight font-bold text-luar tabular-nums">{RESUMO_BANCO.financiamento}</dd>
          </div>
        </dl>
        <p className="mt-3 max-w-[80ch] text-xs leading-normal text-nevoa">
          <strong className="font-semibold text-luar">Aviso:</strong> {AVISO}
        </p>
      </section>

      <AssinanteApp initialPlan={initialPlan} listings={imoveisDaPrevia(initialPlan)} origin={ORIGEM} planOnServer ufNoBanco={ATIVOS_POR_UF} />

      <footer className="border-t border-nevoa/15 px-4 pt-8 pb-16 text-[13px] leading-relaxed text-nevoa sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
          <p className="max-w-[72ch]">
            <strong className="font-semibold text-luar">Aviso:</strong> {AVISO} Fotos e anúncios pertencem às fontes; a foto
            aparece direto do site de origem e, se não carregar, fica o desenho no lugar.
          </p>
          <Link href={BACK_TO_SITE} className="inline-flex min-h-11 items-center font-medium text-latao-texto underline-offset-4 hover:text-luar hover:underline">
            <span aria-hidden="true">←&nbsp;</span>Voltar ao site
          </Link>
        </div>
      </footer>
    </>
  );
}

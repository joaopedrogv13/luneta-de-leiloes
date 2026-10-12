import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/content/site";
import { AssinanteApp } from "@/components/assinante/AssinanteApp";
import { BACK_TO_SITE, type Plan } from "@/components/assinante/shared";

const TITLE = "Área do assinante (demonstração) | Luneta de Leilões";
const DESCRIPTION =
  "Demonstração da área do assinante com exemplos fictícios: filtros, mapa, tags de risco e selos nos planos Lente e Luneta.";

// openGraph e twitter da página substituem os do layout inteiros (merge raso), por isso o card vai de novo.
// A imagem vem de ./opengraph-image.tsx (a mesma da home); o Next a usa também como twitter:image.
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  // Demonstração: nunca indexada; só segue os links quando o site é indexável (substitui o robots do layout).
  robots: { index: false, follow: SITE.indexable },
  alternates: { canonical: "/assinante" },
  openGraph: {
    type: "website",
    locale: SITE.locale,
    url: "/assinante",
    siteName: SITE.name,
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

/**
 * Área do assinante · DEMONSTRAÇÃO (só front-end, sem login nem pagamento), a partir do protótipo
 * project/App Assinante.dc.html. A faixa e o rodapé são estáticos; a interação vive em <AssinanteApp>.
 * O plano inicial (?plano=lente) é decidido aqui, no servidor, para o HTML já sair no plano certo;
 * por isso a rota é dinâmica.
 */
export default async function AssinantePage({ searchParams }: PageProps<"/assinante">) {
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
        aria-label="Aviso de demonstração"
        className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-latao px-4 py-2 text-center text-[13px] leading-snug font-semibold text-noite-fixa"
      >
        <p>Demonstração com exemplos fictícios · sem login</p>
        <Link
          href={BACK_TO_SITE}
          className="inline-flex min-h-11 pointer-fine:min-h-8 items-center rounded-full underline decoration-noite-fixa/50 underline-offset-[3px] hover:decoration-noite-fixa focus-visible:outline-noite-fixa"
        >
          <span aria-hidden="true">←&nbsp;</span>Voltar ao site
        </Link>
      </aside>

      <AssinanteApp initialPlan={initialPlan} />

      <footer className="border-t border-nevoa/15 px-4 pt-8 pb-16 text-[13px] leading-relaxed text-nevoa sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
          <p className="max-w-[72ch]">
            <strong className="font-semibold text-luar">Aviso:</strong> A classificação é uma análise baseada nos dados dos editais,
            não uma garantia, e não substitui a avaliação de um advogado. Exemplos fictícios.
          </p>
          <Link href={BACK_TO_SITE} className="inline-flex min-h-11 items-center font-medium text-latao-texto underline-offset-4 hover:text-luar hover:underline">
            <span aria-hidden="true">←&nbsp;</span>Voltar ao site
          </Link>
        </div>
      </footer>
    </>
  );
}

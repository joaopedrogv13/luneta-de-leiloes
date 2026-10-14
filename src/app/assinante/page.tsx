import type { Metadata } from "next";
import { SITE } from "@/content/site";
import { CatalogoApp } from "@/components/catalogo/CatalogoApp";
import { carregarCatalogo } from "@/components/catalogo/app/carregar";
import { RodapeCatalogo } from "@/components/catalogo/app/Rodape";
import { numero } from "@/lib/catalogo/rotulos";

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
 * Área do assinante · DEMONSTRAÇÃO (só front-end, sem login nem pagamento): o mesmo app da /previa com os
 * exemplos fictícios de src/content/examples.ts (selos ligados). ?plano=lente começa no Lente; a busca
 * da URL é respondida aqui, no servidor, e a primeira pintura chega pronta.
 */
export default async function AssinantePage({ searchParams }: PageProps<"/assinante">) {
  const { props, sobre, total } = await carregarCatalogo("exemplos", await searchParams);
  return (
    <CatalogoApp
      {...props}
      textos={{
        titulo: "Imóveis em leilão",
        area: total > 0 ? `Área do assinante · demonstração com ${numero(total)} exemplos fictícios` : "Área do assinante · demonstração com exemplos fictícios",
      }}
      faixa={{
        completa: "Demonstração com exemplos fictícios · sem login",
        curta: "Demonstração com exemplos fictícios · sem login",
        rotulo: "Aviso de demonstração",
        discreta: true,
      }}
      rodape={<RodapeCatalogo sobre={sobre} total={total} exemplos />}
    />
  );
}

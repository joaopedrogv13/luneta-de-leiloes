import type { Metadata } from "next";
import { SITE } from "@/content/site";
import { CatalogoApp } from "@/components/catalogo/CatalogoApp";
import { carregarCatalogo } from "@/components/catalogo/app/carregar";
import { faixaDaPrevia, RodapeCatalogo } from "@/components/catalogo/app/Rodape";
import { numero } from "@/lib/catalogo/rotulos";

const TITLE = "Prévia interna com dados reais | Luneta de Leilões";
const DESCRIPTION =
  "Prévia interna da área do assinante com imóveis reais da Caixa, da Leilões Judiciais e dos sites dos leiloeiros, classificação automática ainda não revisada.";

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

/**
 * Prévia da fase 1 · INTERNA (só pelo endereço): o catálogo inteiro do instantâneo do banco (base/saida/site),
 * com filtros, mapa, lista ou cards e a página de cada imóvel. A busca da URL é respondida aqui, no servidor
 * (a primeira pintura chega pronta); daí em diante o app busca na API (/api/catalogo). Selos desligados
 * (critérios pendentes com o advogado). Guia de produção: base/FASE1-SITE.md.
 */
export default async function PreviaPage({ searchParams }: PageProps<"/previa">) {
  const { props, sobre, total } = await carregarCatalogo("previa", await searchParams);
  return (
    <CatalogoApp
      {...props}
      textos={{
        titulo: "Imóveis em leilão",
        // total 0: o catálogo não carregou no servidor (o app mostra o aviso e tenta de novo pela API)
        area: total > 0 ? `Prévia interna · ${numero(total)} imóveis reais` : "Prévia interna com dados reais",
      }}
      faixa={faixaDaPrevia(sobre)}
      rodape={<RodapeCatalogo sobre={sobre} total={total} />}
    />
  );
}

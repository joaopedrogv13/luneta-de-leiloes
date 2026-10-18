import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { MetodoLocalizacao } from "@/components/metodologia/MetodoLocalizacao";
import { SITE } from "@/content/site";
import { lerLocalizacao } from "@/lib/catalogo/localizacao";
import { resumoDaBase } from "@/lib/catalogo/metodologia";
import { ROTA_METODO_LOCAL } from "@/lib/catalogo/nota-texto";

const TITLE = "Como a nota de localização é calculada | Luneta de Leilões";
const DESCRIPTION =
  "A nota de 0 a 100 do entorno de cada imóvel em leilão: como achamos o endereço, as seis partes e os pesos, a comparação com os moradores da cidade, as áreas de risco, o que fica de fora e as fontes.";

// openGraph e twitter da página substituem os do layout inteiros (merge raso), por isso o card vai de novo.
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  // Página pública: entra nos buscadores junto com a home, quando o site for indexável (SITE.indexable).
  robots: { index: SITE.indexable, follow: SITE.indexable },
  alternates: { canonical: ROTA_METODO_LOCAL },
  openGraph: {
    type: "article",
    locale: SITE.locale,
    url: ROTA_METODO_LOCAL,
    siteName: SITE.name,
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

/**
 * /metodologia/localizacao: a explicação completa da nota de localização, para quem não é técnico. Página estática:
 * os números saem dos arquivos da nota (base/saida/site/localizacao*.json.gz) na hora do build. A página do imóvel leva
 * até aqui com ?de=<id>, e o "Voltar ao imóvel" nasce no navegador.
 */
export default async function MetodologiaLocalizacao() {
  const resumo = resumoDaBase(await lerLocalizacao());
  return (
    <>
      <a
        href="#conteudo"
        className="fixed top-2 left-2 z-[60] -translate-y-20 rounded-full bg-latao px-4 py-2 text-sm font-semibold text-noite-fixa focus:translate-y-0"
      >
        Pular para o conteúdo
      </a>
      <Nav base="/" />
      <main id="conteudo" tabIndex={-1} className="outline-none">
        <MetodoLocalizacao r={resumo} />
      </main>
      <Footer base="/" />
    </>
  );
}

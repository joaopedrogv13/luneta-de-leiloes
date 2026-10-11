import { FAQ, PLANS, SITE } from "@/content/site";
import { plain } from "@/components/ui/RichText";

/** Dados estruturados (schema.org): Organization, Product/Offer (planos) e FAQPage. */
export function JsonLd() {
  const org = {
    "@type": "Organization",
    "@id": `${SITE.url}/#organization`,
    name: SITE.name,
    url: SITE.url,
    logo: `${SITE.url}/icon.svg`,
    slogan: SITE.slogan,
    description: SITE.description,
    areaServed: { "@type": "Country", name: "Brasil" },
  };

  const product = {
    "@type": "Product",
    "@id": `${SITE.url}/#assinatura`,
    name: `Assinatura ${SITE.name}`,
    description:
      "Assinatura que reúne os leilões de imóveis de todo o Brasil, trata os dados e classifica as oportunidades por risco com tags e selos (Promissor, Na Mira e Alvo).",
    brand: { "@id": org["@id"] },
    image: `${SITE.url}/opengraph-image`,
    offers: PLANS.plans.map((p) => ({
      "@type": "Offer",
      name: `Plano ${p.name}`,
      description: p.audience,
      price: p.priceValue.toFixed(2),
      priceCurrency: "BRL",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: p.priceValue.toFixed(2),
        priceCurrency: "BRL",
        unitCode: "MON",
        referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitCode: "MON" },
      },
      availability: "https://schema.org/InStock",
      url: `${SITE.url}/#planos`,
      seller: { "@id": org["@id"] },
    })),
  };

  const faq = {
    "@type": "FAQPage",
    mainEntity: FAQ.items.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: plain(f.a) },
    })),
  };

  const data = { "@context": "https://schema.org", "@graph": [org, product, faq] };
  return (
    <script
      type="application/ld+json"
      // `<` escapado para não fechar o script por engano (recomendação da doc do Next).
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

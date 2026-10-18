import type { MetadataRoute } from "next";
import { SITE } from "@/content/site";
import { ROTA_METODO_LOCAL } from "@/lib/catalogo/nota-texto";

// Antes do lançamento (SITE.indexable falso) o sitemap fica vazio: não anuncia uma home com noindex.
export default function sitemap(): MetadataRoute.Sitemap {
  if (!SITE.indexable) return [];
  return [
    {
      url: SITE.url,
      lastModified: new Date("2026-10-11"),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      // a explicação pública da nota de localização (src/app/metodologia/localizacao)
      url: `${SITE.url.replace(/\/$/, "")}${ROTA_METODO_LOCAL}`,
      lastModified: new Date("2026-10-18"),
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];
}

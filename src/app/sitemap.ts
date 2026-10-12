import type { MetadataRoute } from "next";
import { SITE } from "@/content/site";

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
  ];
}

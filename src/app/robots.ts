import type { MetadataRoute } from "next";
import { SITE } from "@/content/site";

export default function robots(): MetadataRoute.Robots {
  const rules = { userAgent: "*", allow: "/" };
  // Antes do lançamento (SITE.indexable falso), sem Disallow: o buscador precisa abrir as páginas para ler
  // o noindex do layout e tirar do índice o que já estiver lá. Só o sitemap deixa de ser anunciado.
  if (!SITE.indexable) return { rules };
  return { rules, sitemap: `${SITE.url}/sitemap.xml` };
}

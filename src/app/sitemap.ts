import type { MetadataRoute } from "next";
import { SITE } from "@/content/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE.url,
      lastModified: new Date("2026-10-11"),
      changeFrequency: "daily",
      priority: 1,
    },
  ];
}

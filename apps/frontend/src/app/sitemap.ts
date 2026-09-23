import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { canonicalUrl, indexingEnabled, localeAlternates } from "@/shared/seo/metadata";

export default function sitemap(): MetadataRoute.Sitemap {
  // Only real, published routes; add product URLs when PRD-02 is implemented.
  return indexingEnabled
    ? routing.locales.map((locale) => ({
        url: canonicalUrl(`/${locale}`),
        alternates: { languages: localeAlternates("/") },
      }))
    : [];
}

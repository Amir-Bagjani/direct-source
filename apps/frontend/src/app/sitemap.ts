import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { canonicalUrl, indexingEnabled, localeAlternates } from "@/shared/seo/metadata";
import { readPublicProductsOnServer } from "@/features/catalog/server/public-catalog.server";
import { parseCatalogSearchParams } from "@/features/catalog/utils/catalog-search";

function localizedEntries(path: string, lastModified?: string): MetadataRoute.Sitemap {
  return routing.locales.map((locale) => ({
    url: canonicalUrl(`/${locale}${path === "/" ? "" : path}`),
    alternates: { languages: localeAlternates(path) },
    ...(lastModified ? { lastModified } : {}),
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!indexingEnabled) return [];
  const entries = ["/", "/catalog"].flatMap((path) => localizedEntries(path));
  try {
    const first = await readPublicProductsOnServer(parseCatalogSearchParams({}));
    const pageCount = Math.ceil(first.count / 24);
    const remaining = await Promise.all(
      Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) =>
        readPublicProductsOnServer(parseCatalogSearchParams({ page: String(index + 2) })),
      ),
    );
    const products = [first, ...remaining].flatMap((page) => page.results);
    entries.push(
      ...products.flatMap((product) =>
        localizedEntries(`/catalog/${product.id}`, product.published_at),
      ),
    );
    for (const manufacturer of new Set(products.map((product) => product.manufacturer.id)))
      entries.push(...localizedEntries(`/manufacturers/${manufacturer}`));
  } catch {
    // Keep the public route map available while an upstream catalogue read is unavailable.
  }
  return entries;
}

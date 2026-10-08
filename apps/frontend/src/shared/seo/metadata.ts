import type { Metadata } from "next";
import type { AppLocale } from "@/i18n/routing";

interface BuildMetadataOptions {
  locale: AppLocale;
  path: string;
  title: string;
  description: string;
  indexable?: boolean;
  images?: string[];
}

export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(
  /\/$/,
  "",
);
export const indexingEnabled = process.env.SEO_INDEXABLE === "true";

export function canonicalUrl(path: string) {
  const url = new URL(path, siteUrl);
  if (url.origin !== new URL(siteUrl).origin) throw new Error("Canonical must be same-origin");
  url.search = "";
  url.hash = "";
  return url.href.replace(/\/$/, "");
}

export function localeAlternates(path: string) {
  const suffix = path === "/" ? "" : path;
  return {
    fa: canonicalUrl(`/fa${suffix}`),
    en: canonicalUrl(`/en${suffix}`),
    "x-default": canonicalUrl(`/fa${suffix}`),
  };
}

export function buildMetadata({
  locale,
  path,
  title,
  description,
  indexable = true,
  images,
}: BuildMetadataOptions): Metadata {
  const url = canonicalUrl(`/${locale}${path === "/" ? "" : path}`);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url, languages: localeAlternates(path) },
    robots: { index: indexingEnabled && indexable, follow: indexingEnabled && indexable },
    openGraph: {
      type: "website",
      title,
      description,
      url,
      locale: locale === "fa" ? "fa_IR" : "en_US",
      alternateLocale: locale === "fa" ? "en_US" : "fa_IR",
      ...(images?.length ? { images } : {}),
    },
    twitter: {
      card: images?.length ? "summary_large_image" : "summary",
      title,
      description,
      images,
    },
  };
}

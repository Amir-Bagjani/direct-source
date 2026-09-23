import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { buildMetadata, canonicalUrl } from "@/shared/seo/metadata";
import { JsonLd } from "@/shared/seo/json-ld/json-ld";
import { AboutMarketplace } from "./about-marketplace";

export async function generateMetadata({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: "meta" });
  return buildMetadata({ locale, path: "/", title: t("title"), description: t("description") });
}
export default async function Home({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations("home");
  const meta = await getTranslations("meta");
  return (
    <main id="main" className="hero">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          "@id": canonicalUrl("/") + "#website",
          name: meta("title"),
          url: canonicalUrl(`/${locale}`),
          inLanguage: locale,
        }}
      />
      <p className="eyebrow">{t("eyebrow")}</p>
      <h1>{t("title")}</h1>
      <p>{t("body")}</p>
      <Suspense>
        <AboutMarketplace />
      </Suspense>
    </main>
  );
}

import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { buildMetadata, canonicalUrl } from "@/shared/seo/metadata";
import { JsonLd } from "@/shared/seo/json-ld/json-ld";
import { AboutMarketplace } from "./about-marketplace";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/shared/ui/button/button.variants";
import { cn } from "@/shared/ui/cn";

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
    <main id="main" className="mx-auto grid max-w-5xl gap-6 px-4 py-16 sm:px-6 sm:py-24">
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
      <p className="text-sm font-medium text-muted-foreground">{t("eyebrow")}</p>
      <h1 className="text-3xl font-semibold ltr:tracking-tight sm:text-5xl">{t("title")}</h1>
      <p className="text-muted-foreground">{t("body")}</p>
      <div>
        <Link href="/register" className={cn(buttonVariants())}>
          {t("register")}
        </Link>
      </div>
      <Suspense>
        <AboutMarketplace />
      </Suspense>
    </main>
  );
}

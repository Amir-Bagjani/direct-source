import { Suspense } from "react";
import { CatalogLoading } from "@/features/catalog/components/catalog-loading/catalog-loading";
import { getTranslations } from "next-intl/server";
import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { buildMetadata } from "@/shared/seo/metadata";
import { CatalogSection } from "@/features/catalog/components/catalog-section/catalog-section";
import {
  parseCatalogSearchParams,
  type CatalogSearchParams,
} from "@/features/catalog/utils/catalog-search";

interface CatalogPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<CatalogSearchParams>;
}

export async function generateMetadata({ params }: CatalogPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: "catalog" });
  return buildMetadata({
    locale,
    path: "/catalog",
    title: t("meta.title"),
    description: t("meta.description"),
  });
}

export default async function CatalogPage({ params, searchParams }: CatalogPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: "catalog" });
  const filters = parseCatalogSearchParams(await searchParams);
  return (
    <main id="main" className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:gap-6 sm:px-6 sm:py-10">
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold ltr:tracking-tight sm:text-3xl">{t("title")}</h1>
        <p className="max-w-3xl text-muted-foreground">{t("description")}</p>
      </div>
      <Suspense key={JSON.stringify(filters)} fallback={<CatalogLoading />}>
        <CatalogSection filters={filters} />
      </Suspense>
    </main>
  );
}

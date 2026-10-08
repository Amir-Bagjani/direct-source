import { getTranslations } from "next-intl/server";
import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { z } from "zod";
import { routing } from "@/i18n/routing";
import { buildMetadata } from "@/shared/seo/metadata";
import { ApiError } from "@/shared/api/unwrap";
import { ManufacturerSection } from "@/features/catalog/components/manufacturer-section/manufacturer-section";
import { readPublicManufacturerOnServer } from "@/features/catalog/server/public-catalog.server";
import { parseCatalogSearchParams } from "@/features/catalog/utils/catalog-search";

interface ManufacturerPageProps {
  params: Promise<{ locale: string; id: string }>;
}

async function manufacturerId(params: ManufacturerPageProps["params"]) {
  const value = await params;
  if (!hasLocale(routing.locales, value.locale) || !z.uuid().safeParse(value.id).success)
    notFound();
  return { locale: value.locale, id: value.id };
}

export async function generateMetadata({ params }: ManufacturerPageProps) {
  const { locale, id } = await manufacturerId(params);
  try {
    const [manufacturer, t] = await Promise.all([
      readPublicManufacturerOnServer(id),
      getTranslations({ locale, namespace: "catalog" }),
    ]);
    return buildMetadata({
      locale,
      path: `/manufacturers/${id}`,
      title: t("meta.manufacturerTitle", { manufacturer: manufacturer.name }),
      description:
        manufacturer.description ||
        t("meta.manufacturerDescription", { manufacturer: manufacturer.name }),
      ...(manufacturer.logo_url ? { images: [manufacturer.logo_url] } : {}),
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}

export default async function ManufacturerPage({ params }: ManufacturerPageProps) {
  const { id } = await manufacturerId(params);
  const filters = parseCatalogSearchParams({ manufacturer: id });
  return (
    <main id="main" className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      <ManufacturerSection id={id} filters={filters} />
    </main>
  );
}

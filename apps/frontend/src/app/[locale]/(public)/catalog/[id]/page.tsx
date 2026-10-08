import { getTranslations } from "next-intl/server";
import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { z } from "zod";
import { routing } from "@/i18n/routing";
import { buildMetadata } from "@/shared/seo/metadata";
import { ApiError } from "@/shared/api/unwrap";
import { ProductSection } from "@/features/catalog/components/product-section/product-section";
import { readPublicProductOnServer } from "@/features/catalog/server/public-catalog.server";

interface ProductPageProps {
  params: Promise<{ locale: string; id: string }>;
}

async function productId(params: ProductPageProps["params"]) {
  const value = await params;
  if (!hasLocale(routing.locales, value.locale) || !z.uuid().safeParse(value.id).success)
    notFound();
  return { locale: value.locale, id: value.id };
}

export async function generateMetadata({ params }: ProductPageProps) {
  const { locale, id } = await productId(params);
  try {
    const [product, t] = await Promise.all([
      readPublicProductOnServer(id),
      getTranslations({ locale, namespace: "catalog" }),
    ]);
    return buildMetadata({
      locale,
      path: `/catalog/${id}`,
      title: t("meta.productTitle", { product: product.name }),
      description: product.description || t("meta.productDescription", { product: product.name }),
      images: product.image_urls,
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { id } = await productId(params);
  return (
    <main id="main" className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      <ProductSection id={id} />
    </main>
  );
}

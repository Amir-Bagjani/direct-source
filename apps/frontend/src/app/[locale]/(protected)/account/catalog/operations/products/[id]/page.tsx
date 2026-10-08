import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { requireAccount } from "@/features/accounts/server/guard.server";
import { CatalogProductReview } from "@/features/catalog/components/catalog-review/catalog-review";

export const metadata = { robots: { index: false, follow: false } };

export default async function CatalogProductReviewPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  await requireAccount(locale);
  return (
    <main id="main" className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <CatalogProductReview id={id} />
    </main>
  );
}

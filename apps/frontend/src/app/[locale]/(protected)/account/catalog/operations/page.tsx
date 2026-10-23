import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { requireAccount } from "@/features/accounts/server/guard.server";
import { CatalogOperations } from "@/features/catalog/components/catalog-operations/catalog-operations";

export const metadata = { robots: { index: false, follow: false } };

export default async function CatalogOperationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  await requireAccount(locale);
  return (
    <>
      <CatalogOperations />
    </>
  );
}

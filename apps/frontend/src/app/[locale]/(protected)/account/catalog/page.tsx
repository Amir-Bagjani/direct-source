import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { requireAccount } from "@/features/accounts/server/guard.server";
import { CatalogStudio } from "@/features/catalog/components/catalog-studio/catalog-studio";

export const metadata = { robots: { index: false, follow: false } };

export default async function CatalogStudioPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  await requireAccount(locale);
  return (
    <main id="main" className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6">
      <CatalogStudio />
    </main>
  );
}

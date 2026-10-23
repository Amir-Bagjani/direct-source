import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { requireAccount } from "@/features/accounts/server/guard.server";
import { ProductEditor } from "@/features/catalog/components/product-editor/product-editor";

export const metadata = { robots: { index: false, follow: false } };

export default async function ProductEditorPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  await requireAccount(locale);
  return (
    <>
      <ProductEditor id={id} />
    </>
  );
}

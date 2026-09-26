import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { buildMetadata } from "@/shared/seo/metadata";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/shared/ui/card/card";
import { ResetRequestForm } from "@/features/accounts/components/reset-request-form/reset-request-form";
export async function generateMetadata({ params }: PageProps<"/[locale]/forgot-password">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: "accounts.recovery" });
  return {
    ...buildMetadata({
      locale,
      path: "/forgot-password",
      title: t("forgotTitle"),
      description: t("forgotDescription"),
      indexable: false,
    }),
    referrer: "no-referrer" as const,
  };
}
export default async function Page() {
  const t = await getTranslations("accounts.recovery");
  return (
    <main id="main" className="mx-auto w-full max-w-xl px-4 py-12 sm:px-6">
      <Card>
        <CardHeader>
          <CardTitle>
            <h1>{t("forgotTitle")}</h1>
          </CardTitle>
          <CardDescription>{t("forgotDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ResetRequestForm />
        </CardContent>
      </Card>
    </main>
  );
}

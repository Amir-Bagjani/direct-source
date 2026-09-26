import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { buildMetadata } from "@/shared/seo/metadata";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/shared/ui/card/card";
import { ChallengeScreen } from "@/features/accounts/components/challenge-screen/challenge-screen";
export async function generateMetadata({ params }: PageProps<"/[locale]/account/confirm">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: "accounts.recovery" });
  return {
    ...buildMetadata({
      locale,
      path: "/account/confirm",
      title: t("confirmTitle"),
      description: t("confirmDescription"),
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
            <h1>{t("confirmTitle")}</h1>
          </CardTitle>
          <CardDescription>{t("confirmDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ChallengeScreen />
        </CardContent>
      </Card>
    </main>
  );
}

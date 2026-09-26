import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { RegistrationForm } from "@/features/accounts/components/registration-form/registration-form";
import { buildMetadata } from "@/shared/seo/metadata";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/shared/ui/card/card";

export async function generateMetadata({ params }: PageProps<"/[locale]/register">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: "accounts.register" });
  return buildMetadata({
    locale,
    path: "/register",
    title: t("title"),
    description: t("description"),
    indexable: false,
  });
}

export default async function RegisterPage() {
  const t = await getTranslations("accounts.register");
  return (
    <main id="main" className="mx-auto w-full max-w-xl px-4 py-12 sm:px-6">
      <Card>
        <CardHeader>
          <CardTitle>
            <h1>{t("title")}</h1>
          </CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <RegistrationForm />
        </CardContent>
      </Card>
    </main>
  );
}

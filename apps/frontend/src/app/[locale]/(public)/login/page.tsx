import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { buildMetadata } from "@/shared/seo/metadata";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/shared/ui/card/card";
import { LoginForm } from "@/features/accounts/components/login-form/login-form";
export async function generateMetadata({ params }: PageProps<"/[locale]/login">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: "accounts.login" });
  return buildMetadata({
    locale,
    path: "/login",
    title: t("title"),
    description: t("description"),
    indexable: false,
  });
}
export default async function LoginPage() {
  const t = await getTranslations("accounts.login");
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
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}

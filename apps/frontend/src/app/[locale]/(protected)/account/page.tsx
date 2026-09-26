import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/ui/card/card";
import { requireAccount } from "@/features/accounts/server/guard.server";
import { AccountPanel } from "@/features/accounts/components/account-panel/account-panel";
export const metadata = { robots: { index: false, follow: false } };
export default async function AccountPage({ params }: PageProps<"/[locale]/account">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  await requireAccount(locale);
  const t = await getTranslations("accounts.account");
  return (
    <main id="main" className="mx-auto w-full max-w-xl px-4 py-12 sm:px-6">
      <Card>
        <CardHeader>
          <CardTitle>
            <h1>{t("title")}</h1>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AccountPanel />
        </CardContent>
      </Card>
    </main>
  );
}

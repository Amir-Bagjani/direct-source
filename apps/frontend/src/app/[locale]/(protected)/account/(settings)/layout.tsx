import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { requireAccount } from "@/features/accounts/server/guard.server";
import { AccountShell } from "@/features/accounts/components/account-shell/account-shell";
export const metadata = { robots: { index: false, follow: false } };
export default async function AccountLayout({
  children,
  params,
}: LayoutProps<"/[locale]/account">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  await requireAccount(locale);
  return <AccountShell>{children}</AccountShell>;
}

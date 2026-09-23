import type { Metadata, Viewport } from "next";
import { Inter, Vazirmatn } from "next/font/google";
import { Suspense } from "react";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { QueryProvider } from "@/shared/query/query-provider/query-provider";
import { SiteHeader } from "@/shared/ui/site-header/site-header";
import { siteUrl } from "@/shared/seo/metadata";
import { parseTheme, THEME_COLORS, THEME_COOKIE_NAME } from "@/shared/theme/theme";
import "../globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter-loaded",
});

const vazirmatn = Vazirmatn({
  subsets: ["arabic"],
  display: "swap",
  variable: "--font-vazirmatn-loaded",
});

async function getRequestTheme() {
  return parseTheme((await cookies()).get(THEME_COOKIE_NAME)?.value);
}

export async function generateViewport(): Promise<Viewport> {
  const theme = await getRequestTheme();
  return {
    colorScheme: "light dark",
    themeColor: THEME_COLORS[theme],
  };
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    metadataBase: new URL(siteUrl),
    title: { default: t("title"), template: `%s | ${t("title")}` },
    description: t("description"),
    robots: { index: false, follow: false },
  };
}
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}
export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const messages = await getMessages();
  const theme = await getRequestTheme();
  return (
    <html
      className={`${inter.variable} ${vazirmatn.variable}`}
      data-theme={theme}
      lang={locale}
      dir={locale === "fa" ? "rtl" : "ltr"}
    >
      <body>
        <NextIntlClientProvider messages={messages}>
          <QueryProvider>
            <Suspense>
              <SiteHeader initialTheme={theme} />
            </Suspense>
            {children}
          </QueryProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

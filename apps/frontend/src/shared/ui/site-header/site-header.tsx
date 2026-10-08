import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LanguageSwitcher } from "@/shared/ui/language-switcher/language-switcher";
import { ThemeSwitcher } from "@/shared/ui/theme-switcher/theme-switcher";
import type { Theme } from "@/shared/theme/theme";

export async function SiteHeader({ initialTheme }: { initialTheme: Theme }) {
  const t = await getTranslations("nav");
  const meta = await getTranslations("meta");
  return (
    <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-4 border-b bg-background px-4 py-3 sm:px-6">
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:rounded-lg focus:bg-primary focus:p-3 focus:text-primary-foreground"
        href="#main"
      >
        {t("skip")}
      </a>
      <Link href="/" className="inline-flex min-h-11 items-center font-medium">
        {meta("title")}
      </Link>
      <nav className="flex flex-wrap items-center gap-4" aria-label={t("primary")}>
        <Link href="/catalog" className="inline-flex min-h-11 items-center">
          {t("catalog")}
        </Link>
        <Link href="/account" className="inline-flex min-h-11 items-center">
          {t("account")}
        </Link>
        <ThemeSwitcher initialTheme={initialTheme} />
        <LanguageSwitcher />
      </nav>
    </header>
  );
}

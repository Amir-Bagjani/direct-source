import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LanguageSwitcher } from "@/shared/ui/language-switcher/language-switcher";
import { ThemeSwitcher } from "@/shared/ui/theme-switcher/theme-switcher";
import type { Theme } from "@/shared/theme/theme";

export async function SiteHeader({ initialTheme }: { initialTheme: Theme }) {
  const t = await getTranslations("nav");
  const meta = await getTranslations("meta");
  return (
    <header className="site-header">
      <a className="skip-link" href="#main">
        {t("skip")}
      </a>
      <Link href="/" className="brand">
        {meta("title")}
      </Link>
      <nav aria-label={t("primary")}>
        <ThemeSwitcher initialTheme={initialTheme} />
        <LanguageSwitcher />
      </nav>
    </header>
  );
}

"use client";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, usePathname } from "@/i18n/navigation";

export function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const params = useSearchParams();
  const t = useTranslations("nav");
  return (
    <Link
      className="inline-flex min-h-11 items-center underline underline-offset-4"
      aria-label={t("language")}
      href={`${pathname}?${params.toString()}`}
      locale={locale === "fa" ? "en" : "fa"}
      replace
    >
      {t("switchLanguage")}
    </Link>
  );
}

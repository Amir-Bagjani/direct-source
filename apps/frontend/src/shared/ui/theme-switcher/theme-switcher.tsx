"use client";
import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/ui/button/button";
import {
  applyTheme,
  DEFAULT_THEME,
  readDocumentTheme,
  THEME_CHANGE_EVENT,
  type Theme,
} from "@/shared/theme/theme";

function subscribe(notify: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, notify);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, notify);
}

function getThemeSnapshot() {
  return readDocumentTheme(document.documentElement);
}

export function ThemeSwitcher({ initialTheme = DEFAULT_THEME }: { initialTheme?: Theme }) {
  const theme = useSyncExternalStore(subscribe, getThemeSnapshot, () => initialTheme);
  const t = useTranslations("theme");
  return (
    <div className="theme-switcher" role="group" aria-label={t("label")}>
      <Button
        aria-pressed={theme === "light"}
        className="theme-switcher__option"
        onClick={() => applyTheme("light")}
        variant="secondary"
      >
        {t("light")}
      </Button>
      <Button
        aria-pressed={theme === "dark"}
        className="theme-switcher__option"
        onClick={() => applyTheme("dark")}
        variant="secondary"
      >
        {t("dark")}
      </Button>
    </div>
  );
}

"use client";
import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { ToggleGroup, ToggleGroupItem } from "@/shared/ui/toggle-group/toggle-group";
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
    <ToggleGroup
      aria-label={t("label")}
      value={[theme]}
      onValueChange={(values) => {
        const selected = values[0];
        if (selected === "light" || selected === "dark") applyTheme(selected);
      }}
      variant="outline"
      spacing={0}
    >
      <ToggleGroupItem value="light">{t("light")}</ToggleGroupItem>
      <ToggleGroupItem value="dark">{t("dark")}</ToggleGroupItem>
    </ToggleGroup>
  );
}

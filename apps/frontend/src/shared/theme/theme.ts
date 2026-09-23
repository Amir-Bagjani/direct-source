export const DEFAULT_THEME = "light";
export const THEME_COOKIE_NAME = "directsourcing-theme-v1";
export const THEME_CHANGE_EVENT = "directsourcing:theme-change";

export const themes = ["light", "dark"] as const;
export type Theme = (typeof themes)[number];
export const THEME_COLORS = {
  light: "#f7f8fa",
  dark: "#131416",
} satisfies Record<Theme, string>;

export function parseTheme(value: unknown): Theme {
  return value === "dark" || value === "light" ? value : DEFAULT_THEME;
}

export function readDocumentTheme(root: HTMLElement): Theme {
  return parseTheme(root.dataset.theme);
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  document
    .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_COLORS[theme]);
  try {
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${THEME_COOKIE_NAME}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  } catch {
    // The selected theme still applies for this document when persistence is unavailable.
  }
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

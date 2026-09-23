// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { THEME_COOKIE_NAME } from "@/shared/theme/theme";
import { ThemeSwitcher } from "./theme-switcher";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

beforeEach(() => {
  document.documentElement.dataset.theme = "light";
  document.cookie = `${THEME_COOKIE_NAME}=; Path=/; Max-Age=0`;
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(document, "cookie");
});

it("exposes two localized, pressed-state theme choices and persists selection", () => {
  render(<ThemeSwitcher />);
  const group = screen.getByRole("group", { name: "label" });
  const light = screen.getByRole("button", { name: "light" });
  const dark = screen.getByRole("button", { name: "dark" });
  expect(group.contains(light)).toBe(true);
  expect(light.getAttribute("aria-pressed")).toBe("true");
  expect(dark.getAttribute("aria-pressed")).toBe("false");

  fireEvent.click(dark);
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(document.cookie).toContain(`${THEME_COOKIE_NAME}=dark`);
  expect(dark.getAttribute("aria-pressed")).toBe("true");

  fireEvent.click(light);
  expect(document.documentElement.dataset.theme).toBe("light");
  expect(document.cookie).toContain(`${THEME_COOKIE_NAME}=light`);
  expect(light.getAttribute("aria-pressed")).toBe("true");
});

it("hydrates an explicitly selected Dark theme without changing its pressed state", () => {
  document.documentElement.dataset.theme = "dark";
  render(<ThemeSwitcher initialTheme="dark" />);
  expect(screen.getByRole("button", { name: "dark" }).getAttribute("aria-pressed")).toBe("true");
});

it("keeps the selected document theme when cookie persistence is unavailable", () => {
  Object.defineProperty(document, "cookie", {
    configurable: true,
    get: () => "",
    set: () => {
      throw new Error("Cookies disabled");
    },
  });
  render(<ThemeSwitcher />);
  fireEvent.click(screen.getByRole("button", { name: "dark" }));
  expect(document.documentElement.dataset.theme).toBe("dark");
});

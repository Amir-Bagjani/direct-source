import { test, expect } from "@playwright/test";
import en from "../messages/en.json" with { type: "json" };
import fa from "../messages/fa.json" with { type: "json" };

for (const [locale, messages] of [
  ["en", en],
  ["fa", fa],
] as const) {
  test(`${locale}: registration navigation, validation, keyboard, theme and reflow`, async ({
    page,
  }) => {
    const copy = messages.accounts.register;
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(`/${locale}`);
    await page.getByRole("link", { name: messages.home.register }).click();
    await expect(page.getByRole("heading", { name: copy.title })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator("html")).toHaveAttribute("dir", locale === "fa" ? "rtl" : "ltr");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `http://localhost:3000/${locale}/register`,
    );
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    const firstName = page.getByLabel(copy.fields.first_name, { exact: true });
    await firstName.fill("Draft");
    await page.getByRole("button", { name: messages.theme.dark, exact: true }).click();
    for (const kind of ["terms", "privacy"] as const) {
      const opened = page.waitForEvent("popup");
      await page
        .getByRole("link", { name: messages.accounts.policies[kind].title, exact: false })
        .click();
      const policy = await opened;
      await expect(policy.locator("html")).toHaveAttribute("data-theme", "dark");
      await expect(policy.getByRole("heading", { level: 1 })).toHaveText(
        messages.accounts.policies[kind].title,
      );
      await expect(policy).toHaveURL(new RegExp(`/${locale}/${kind}$`));
      await expect(policy.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        `http://localhost:3000/${locale}/${kind}`,
      );
      expect(
        await policy.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await policy.close();
      await expect(firstName).toHaveValue("Draft");
    }
    await firstName.clear();
    await page.getByRole("button", { name: copy.submit, exact: true }).click();
    await expect(page.getByText(copy.validation.accept_terms)).toBeVisible();
    await expect(page.getByLabel(copy.fields.first_name, { exact: true })).toBeFocused();
    const checkbox = page.getByRole("checkbox");
    await checkbox.focus();
    await page.keyboard.press("Space");
    await expect(checkbox).toBeChecked();
    await page.getByRole("button", { name: messages.theme.dark, exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.getByRole("link", { name: messages.nav.language }).click();
    await expect(page).toHaveURL(new RegExp(`/${locale === "fa" ? "en" : "fa"}/register$`));
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
}

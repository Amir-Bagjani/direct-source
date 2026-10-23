import { writeFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import en from "../messages/en.json" with { type: "json" };
import fa from "../messages/fa.json" with { type: "json" };
import { publicProductPageSchema } from "../src/features/catalog/schemas/public-catalog.schema";

for (const [locale, messages] of [
  ["en", en],
  ["fa", fa],
] as const) {
  test(`${locale}: real 26-product pagination preserves filters, order and browser history`, async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const response = await request.get("http://127.0.0.1:8001/api/v1/catalog/public/products/");
    expect(response.status()).toBe(200);
    const products = publicProductPageSchema.parse(await response.json());
    expect(products.count).toBe(26);
    expect(products.results).toHaveLength(24);
    const first = products.results[0];
    if (!first) throw new Error("Pagination fixture missing");
    const query = new URLSearchParams({
      q: "Pagination",
      manufacturer: first.manufacturer.id,
      method: "free_mix",
    });
    await page.goto(`/${locale}/catalog?${query}`);
    const headings = page.getByRole("heading", { name: /^Pagination Shoe /u });
    await expect(headings).toHaveCount(24);
    expect(await headings.allTextContents()).toEqual(
      Array.from(
        { length: 24 },
        (_, index) => `Pagination Shoe ${String(25 - index).padStart(2, "0")}`,
      ),
    );
    const pagination = page.getByRole("navigation", { name: messages.catalog.pagination });
    await pagination.getByRole("link", { name: messages.catalog.next, exact: true }).click();
    await expect(headings).toHaveCount(2);
    expect(await headings.allTextContents()).toEqual(["Pagination Shoe 01", "Pagination Shoe 00"]);
    const url = new URL(page.url());
    expect(url.searchParams.get("page")).toBe("2");
    for (const [key, value] of query) expect(url.searchParams.get(key)).toBe(value);
    await expect(
      pagination.getByRole("link", { name: messages.catalog.next, exact: true }),
    ).toHaveCount(0);
    await page.goBack();
    await expect(headings).toHaveCount(24);
    await page.goForward();
    await expect(headings).toHaveCount(2);
    await pagination.getByRole("link", { name: messages.catalog.previous, exact: true }).click();
    await expect(headings).toHaveCount(24);
    await page.reload();
    await expect(headings).toHaveCount(24);
    expect(await headings.first().textContent()).toBe("Pagination Shoe 25");
    const manifest = [];
    for (const theme of ["light", "dark"] as const) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.getByRole("button", { name: messages.theme[theme], exact: true }).click();
      for (const [viewport, size] of [
        ["desktop", { width: 1440, height: 1000 }],
        ["mobile", { width: 390, height: 844 }],
      ] as const) {
        await page.setViewportSize(size);
        await pagination.scrollIntoViewIfNeeded();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await page.evaluate(() => document.fonts.ready);
        const screenshot = `pagination-screenshots/${locale}__${theme}__${viewport}.png`;
        await page.screenshot({
          path: `../../handoff/prd-02-completion-2026-10-12/${screenshot}`,
          animations: "disabled",
        });
        manifest.push({
          actor: "guest",
          locale,
          theme,
          viewport: size,
          route: new URL(page.url()).pathname + new URL(page.url()).search,
          state: "24-of-26-first-page",
          screenshot,
          captured_at: new Date().toISOString(),
          render_mode: "production",
        });
      }
    }
    await writeFile(
      `../../handoff/prd-02-completion-2026-10-12/pagination-${locale}-manifest.json`,
      JSON.stringify(manifest, null, 2),
    );
  });
}

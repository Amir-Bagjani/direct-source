import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test, expect } from "@playwright/test";
import en from "../messages/en.json" with { type: "json" };
import fa from "../messages/fa.json" with { type: "json" };
import { publicProductPageSchema } from "../src/features/catalog/schemas/public-catalog.schema";

test("en: PRD-02 rendered catalogue and workspace matrix", async ({ browser, request }) => {
  test.setTimeout(180_000);
  const response = await request.get("http://127.0.0.1:8001/api/v1/catalog/public/products/");
  expect(response.status()).toBe(200);
  const { results } = publicProductPageSchema.parse(await response.json());
  const product = results[0];
  if (!product) throw new Error("Catalogue QA fixture product missing");
  const folder = resolve("../../handoff/prd-02-completion-2026-10-12");
  await mkdir(`${folder}/screenshots`, { recursive: true });
  const manifest = [];
  for (const actor of ["guest", "manufacturer", "operator"] as const) {
    const authentication = await browser.newContext();
    if (actor !== "guest") {
      const page = await authentication.newPage();
      await page.goto("/en/login");
      await page
        .getByLabel(en.accounts.register.fields.mobile, { exact: true })
        .fill(actor === "manufacturer" ? "09120000002" : "09120000004");
      await page
        .getByLabel(en.accounts.register.fields.password, { exact: true })
        .fill(
          actor === "manufacturer" ? "Catalog-e2e-password-2026!" : "Operator-e2e-password-2026!",
        );
      await page.getByRole("button", { name: en.accounts.login.submit, exact: true }).click();
      await expect(page).toHaveURL(/\/en\/account$/u, { timeout: 30_000 });
    }
    // Keep the real session in memory across viewports; repeated logins hit the real 10/min limit.
    const storageState = await authentication.storageState();
    await authentication.close();
    for (const locale of ["en", "fa"] as const) {
      const messages = locale === "fa" ? fa : en;
      for (const theme of ["light", "dark"] as const) {
        for (const [viewportName, viewport] of [
          ["desktop", { width: 1440, height: 1000 }],
          ["mobile", { width: 390, height: 844 }],
        ] as const) {
          const context = await browser.newContext({
            viewport,
            colorScheme: "dark",
            locale,
            storageState,
          });
          if (theme === "dark")
            await context.addCookies([
              {
                name: "directsourcing-theme-v1",
                value: "dark",
                url: "http://localhost:3100",
              },
            ]);
          const page = await context.newPage();
          const errors: string[] = [];
          page.on("pageerror", (error) => errors.push(error.message));
          const routes: Array<[string, string]> =
            actor === "guest"
              ? [
                  ["catalog", messages.catalog.title],
                  [`catalog/${product.id}`, product.name],
                  [`manufacturers/${product.business}`, product.manufacturer.name],
                ]
              : actor === "manufacturer"
                ? [
                    ["account/catalog", messages.catalogManagement.studioTitle],
                    [`account/catalog/${product.id}`, product.name],
                  ]
                : [["account/catalog/operations", messages.catalogManagement.operatorTitle]];
          for (const [route, title] of routes) {
            await page.goto(`/${locale}/${route}`);
            await expect(
              page.getByRole("heading", { level: 1, name: title, exact: true }),
            ).toBeVisible({ timeout: 30_000 });
            if (route.startsWith("catalog"))
              await expect(
                page.getByText(messages.catalog.priceProtected, { exact: true }).first(),
              ).toBeVisible();
            if (route.startsWith("account"))
              await expect(
                page.getByText(messages.catalogManagement.loading, { exact: true }),
              ).toHaveCount(0);
            await page.evaluate(() => document.fonts.ready);
            await expect
              .poll(() =>
                page.locator("img").evaluateAll((images) =>
                  images
                    .filter((image) => {
                      const rect = image.getBoundingClientRect();
                      return rect.bottom > 0 && rect.top < innerHeight && rect.width > 0;
                    })
                    .every(
                      (image) =>
                        image instanceof HTMLImageElement &&
                        image.complete &&
                        image.naturalWidth > 0,
                    ),
                ),
              )
              .toBe(true);
            await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
            await expect(page.locator("html")).toHaveAttribute(
              "dir",
              locale === "fa" ? "rtl" : "ltr",
            );
            expect(
              await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            ).toBe(true);
            const file = `${actor}__${route.replaceAll("/", "-")}__${locale}__${theme}__${viewportName}.png`;
            await page.screenshot({ path: `${folder}/screenshots/${file}`, caret: "initial" });
            manifest.push({
              actor,
              route: `/${locale}/${route}`,
              locale,
              theme,
              viewport,
              screenshot: `screenshots/${file}`,
              captured_at: new Date().toISOString(),
            });
          }
          expect(errors).toEqual([]);
          await context.close();
        }
      }
    }
  }
  await writeFile(`${folder}/visual-matrix.json`, JSON.stringify(manifest, null, 2));
});

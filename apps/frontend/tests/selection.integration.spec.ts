import { writeFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import en from "../messages/en.json" with { type: "json" };
import fa from "../messages/fa.json" with { type: "json" };
import { publicProductPageSchema } from "../src/features/catalog/schemas/public-catalog.schema";
import { quoteSchema } from "../src/features/catalog/schemas/catalog-quote.schema";
import { signOut } from "./helpers/account-navigation";

for (const [locale, messages] of [
  ["en", en],
  ["fa", fa],
] as const) {
  for (const actor of ["retailer", "manufacturer"] as const) {
    test(`${locale}: ${actor} estimates free mix and packs without reserving stock`, async ({
      page,
      request,
    }) => {
      test.setTimeout(180_000);
      const products = publicProductPageSchema.parse(
        await (await request.get("http://127.0.0.1:8001/api/v1/catalog/public/products/")).json(),
      );
      const product = products.results[0];
      if (!product) throw new Error("Product fixture missing");
      expect(product.lead_time_days).toBe(0);
      const variant = product.variants.find((item) => item.sku === "AF-101-BLK-42");
      if (!variant) throw new Error("Variant fixture missing");
      const endpoint = `/api/bff/catalog/wholesale/products/${product.id}/quote`;
      const selection = { method: "free_mix", items: [{ variant: variant.id, quantity: 13 }] };
      const guest = await request.post(endpoint, {
        headers: { Origin: "http://localhost:3100" },
        data: selection,
      });
      expect(guest.status()).toBe(401);
      expect(await guest.text()).not.toContain("goods_total_irr");
      await page.goto(`/${locale}/login`);
      await page
        .getByLabel(messages.accounts.register.fields.mobile, { exact: true })
        .fill(actor === "retailer" ? "09120000003" : "09120000002");
      await page
        .getByLabel(messages.accounts.register.fields.password, { exact: true })
        .fill(actor === "retailer" ? "Retailer-e2e-password-2026!" : "Catalog-e2e-password-2026!");
      await page.getByRole("button", { name: messages.accounts.login.submit, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/account$`), { timeout: 30_000 });
      const route =
        actor === "retailer"
          ? `/${locale}/catalog/${product.id}`
          : `/${locale}/account/catalog/${product.id}`;
      await page.goto(route);
      const panel = page.getByRole("region", {
        name: messages.catalog.selection.title,
        exact: true,
      });
      await expect(panel).toBeVisible({ timeout: 30_000 });
      const quantity = panel.getByLabel(
        messages.catalog.selection.variantQuantity.replace("{sku}", variant.sku),
        { exact: true },
      );
      await expect(
        panel.getByLabel(
          messages.catalog.selection.variantQuantity.replace("{sku}", "AF-101-BLK-43"),
          { exact: true },
        ),
      ).toBeDisabled();
      const calculate = panel.getByRole("button", {
        name: messages.catalog.selection.calculate,
        exact: true,
      });
      await quantity.fill("1");
      await expect(calculate).toBeDisabled();
      await quantity.fill("12");
      await calculate.click();
      const result = panel.getByRole("region", {
        name: messages.catalog.selection.result,
        exact: true,
      });
      await expect(result.getByText(messages.catalog.readyNow, { exact: true })).toBeVisible();
      await panel
        .getByRole("button", { name: messages.catalog.method.fixed_pack, exact: true })
        .focus();
      await page.keyboard.press("Space");
      await expect(result).toHaveCount(0);
      await panel.getByLabel(messages.catalog.selection.packCount, { exact: true }).fill("2");
      await calculate.click();
      await expect(
        result.getByRole("table", { name: messages.catalog.selection.lines, exact: true }),
      ).toContainText(new Intl.NumberFormat(locale).format(500000));
      if (actor === "retailer") {
        expect(
          (
            await page.request.post(endpoint, {
              headers: { Origin: "https://invalid.example" },
              data: selection,
            })
          ).status(),
        ).toBe(403);
        expect(
          (
            await page.request.post(endpoint, {
              headers: { Origin: "http://localhost:3100" },
              data: { method: "fixed_pack", pack_code: "pair", pack_count: 1.5 },
            })
          ).status(),
        ).toBe(400);
      }
      const manifest = [];
      const folder = "../../handoff/prd-02-completion-2026-10-12/selection-screenshots";
      for (const theme of ["light", "dark"] as const) {
        await page
          .context()
          .addCookies([
            { name: "directsourcing-theme-v1", value: theme, url: "http://localhost:3100" },
          ]);
        for (const [viewport, size] of [
          ["desktop", { width: 1440, height: 1000 }],
          ["mobile", { width: 390, height: 844 }],
        ] as const) {
          await page.setViewportSize(size);
          await page.goto(route);
          await expect(panel).toBeVisible();
          await quantity.fill("13");
          const responsePromise = page.waitForResponse(
            (response) =>
              response.request().method() === "POST" &&
              response
                .url()
                .includes(actor === "retailer" ? endpoint : "/api/bff/catalog/studio/quote"),
          );
          await calculate.click();
          const response = await responsePromise;
          expect(response.status()).toBe(200);
          const quote = quoteSchema.parse(await response.json());
          expect(quote).toMatchObject({
            quantity: 13,
            tier_min_quantity: 12,
            goods_total_irr: "14300000",
            lead_time_days: 7,
            lines: [{ from_ready: 12, from_production: 1 }],
          });
          await expect(
            result.getByText(
              messages.catalog.selection.productionDays.replace(
                "{count}",
                new Intl.NumberFormat(locale).format(7),
              ),
              { exact: true },
            ),
          ).toBeVisible();
          await page.evaluate(() => document.fonts.ready);
          await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
          for (const state of ["form", "result"] as const) {
            if (state === "form")
              await panel
                .getByRole("heading", { name: messages.catalog.selection.title, exact: true })
                .scrollIntoViewIfNeeded();
            else await result.scrollIntoViewIfNeeded();
            const file = `${actor}__${locale}__${theme}__${viewport}__${state}.png`;
            await page.screenshot({ path: `${folder}/${file}`, animations: "disabled" });
            manifest.push({
              actor,
              locale,
              theme,
              viewport: size,
              route,
              state,
              screenshot: `selection-screenshots/${file}`,
              captured_at: new Date().toISOString(),
            });
          }
        }
      }
      await writeFile(
        `../../handoff/prd-02-completion-2026-10-12/selection-${actor}-${locale}-manifest.json`,
        JSON.stringify(manifest, null, 2),
      );
      // Repeated estimates leave the source availability untouched.
      const after = publicProductPageSchema.parse(
        await (await request.get("http://127.0.0.1:8001/api/v1/catalog/public/products/")).json(),
      );
      expect(
        after.results[0]?.variants.find((item) => item.id === variant.id)?.supply?.ready_stock,
      ).toBe(12);
      if (actor === "retailer") {
        await signOut(page, messages);
        await expect(page).toHaveURL(new RegExp(`/${locale}$`));
        await page.goto(`/${locale}/catalog/${product.id}`);
        await expect(
          page.getByText(messages.catalog.priceProtected, { exact: true }),
        ).toBeVisible();
        await expect(panel).toHaveCount(0);
        expect(
          (
            await page.request.post(endpoint, {
              headers: { Origin: "http://localhost:3100" },
              data: selection,
            })
          ).status(),
        ).toBe(401);
      }
    });
  }
}

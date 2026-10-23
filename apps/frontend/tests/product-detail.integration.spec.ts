import { writeFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import en from "../messages/en.json" with { type: "json" };
import fa from "../messages/fa.json" with { type: "json" };
import { publicProductPageSchema } from "../src/features/catalog/schemas/public-catalog.schema";

for (const [locale, messages] of [
  ["en", en],
  ["fa", fa],
] as const) {
  test(`${locale}: product gallery, managed comparison, delivery and variant modal work with signed images`, async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const manifest = [];
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const response = await request.get("http://127.0.0.1:8001/api/v1/catalog/public/products/");
    expect(response.status()).toBe(200);
    const product = publicProductPageSchema.parse(await response.json()).results[0];
    if (!product || product.image_urls.length < 2)
      throw new Error("Scanned catalogue media fixture missing");
    const variant = product.variants.find((item) => item.sku === "AF-101-BLK-42");
    if (!variant) throw new Error("Variant fixture missing");
    const signed = await request.get(product.image_urls[0]!);
    expect(signed.status()).toBe(200);
    expect(signed.headers()["content-type"]).toBe("image/png");
    expect(signed.headers()["x-amz-server-side-encryption"]).toBe("AES256");
    const tampered = new URL(product.image_urls[0]!);
    tampered.searchParams.set("X-Amz-Signature", "0".repeat(64));
    expect((await request.get(tampered.href)).status()).toBe(403);

    await page.goto(`/${locale}/catalog/${product.id}`);
    const reviewsResponse = await page.request.get(
      `/api/bff/catalog/products/${product.id}/reviews?page=1`,
    );
    expect(reviewsResponse.status()).toBe(200);
    expect(await reviewsResponse.json()).toEqual({
      count: 0,
      next: null,
      previous: null,
      results: [],
    });
    expect(
      (
        await page.request.get(`/api/bff/catalog/products/${product.id}/reviews?topic=retailer`)
      ).status(),
    ).toBe(400);
    expect((await page.request.get("/api/bff/catalog/products/not-a-uuid/reviews")).status()).toBe(
      404,
    );
    expect((await page.request.get(`/api/bff/catalog/reviews/${product.id}/images`)).status()).toBe(
      404,
    );
    await expect(page.getByText(messages.catalog.reviews.empty, { exact: true })).toBeAttached();
    const gallery = page.getByRole("region", { name: messages.catalog.gallery.title, exact: true });
    const main = gallery.getByRole("img", { name: product.name, exact: true });
    await expect
      .poll(() =>
        main.evaluate(
          (image) =>
            image instanceof HTMLImageElement && image.complete && image.naturalWidth === 800,
        ),
      )
      .toBe(true);
    await gallery.getByRole("button", { name: messages.catalog.gallery.next, exact: true }).click();
    expect(new URL((await main.getAttribute("src")) ?? "").pathname).toBe(
      new URL(product.image_urls[1]!).pathname,
    );
    await gallery
      .getByRole("button", { name: messages.catalog.gallery.previous, exact: true })
      .click();
    const imageTrigger = page.getByRole("button", {
      name: messages.catalog.variants.viewImages.replace("{sku}", variant.sku),
      exact: true,
    });
    await imageTrigger.click();
    const dialog = page.getByRole("dialog", { name: variant.sku, exact: true });
    await expect(dialog).toBeVisible();
    await expect
      .poll(() =>
        dialog
          .getByRole("img", { name: variant.sku, exact: true })
          .evaluate(
            (image) =>
              image instanceof HTMLImageElement && image.complete && image.naturalWidth === 800,
          ),
      )
      .toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(imageTrigger).toBeFocused();
    await page.goForward();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: messages.common.close, exact: true }).click();
    await expect(dialog).toBeHidden();
    const specifications = page.getByRole("heading", {
      name: messages.catalog.specifications,
      exact: true,
    });
    await expect(specifications).toBeVisible();
    await expect(page.getByText("چرم طبیعی", { exact: true })).toBeVisible();
    await expect(page.getByText("material", { exact: true })).toHaveCount(0);
    const comparison = page.getByRole("table", {
      name: messages.catalog.variants.comparisonCaption,
      exact: true,
    });
    await expect(comparison).toContainText("مشکی");
    await expect(comparison).toContainText("42 EU");
    await expect(
      page.getByRole("table", { name: messages.catalog.wholesale.caption, exact: true }),
    ).toHaveCount(0);
    const number = new Intl.NumberFormat(locale);
    await expect(
      page.getByText(
        messages.catalog.shipping.deliveryRange
          .replace("{min}", number.format(1))
          .replace("{max}", number.format(7)),
        { exact: true },
      ),
    ).toBeVisible();

    await page.setViewportSize({ width: 320, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await imageTrigger.click();
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    await dialog.getByRole("button", { name: messages.common.close, exact: true }).click();
    await expect(dialog).toBeHidden();

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
        await page.goto(`/${locale}/catalog/${product.id}`);
        await expect(main).toBeVisible();
        await expect(
          page.getByText(messages.catalog.priceProtected, { exact: true }),
        ).toBeVisible();
        await expect
          .poll(() =>
            main.evaluate(
              (image) =>
                image instanceof HTMLImageElement && image.complete && image.naturalWidth === 800,
            ),
          )
          .toBe(true);
        await page.evaluate(() => document.fonts.ready);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(page.locator("html")).toHaveAttribute("dir", locale === "fa" ? "rtl" : "ltr");
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        const folder = "../../handoff/prd-02-completion-2026-10-12/product-detail-screenshots";
        await page.screenshot({
          path: `${folder}/detail__${locale}__${theme}__${viewport}__top.png`,
          caret: "initial",
          animations: "disabled",
        });
        for (const [region, heading] of [
          ["variants", messages.catalog.variants.title],
          ["shipping", messages.catalog.shipping.title],
          ["reviews", messages.catalog.reviews.title],
        ] as const) {
          await page.getByRole("heading", { name: heading, exact: true }).scrollIntoViewIfNeeded();
          if (region === "variants") await comparison.scrollIntoViewIfNeeded();
          else if (region === "shipping")
            await page
              .getByText(
                messages.catalog.shipping.deliveryRange
                  .replace("{min}", number.format(1))
                  .replace("{max}", number.format(7)),
                { exact: true },
              )
              .scrollIntoViewIfNeeded();
          else
            await page
              .getByRole("region", { name: messages.catalog.reviews.title, exact: true })
              .scrollIntoViewIfNeeded();
          await page.screenshot({
            path: `${folder}/detail__${locale}__${theme}__${viewport}__${region}.png`,
            caret: "initial",
            animations: "disabled",
          });
          if (region === "variants" && viewport === "mobile") {
            const scroll = comparison.locator("..");
            await scroll.hover();
            await page.mouse.wheel(locale === "fa" ? -1000 : 1000, 0);
            await expect
              .poll(() => scroll.evaluate((element) => Math.abs(element.scrollLeft)))
              .toBeGreaterThan(0);
            await page.screenshot({
              path: `${folder}/detail__${locale}__${theme}__${viewport}__variants-end.png`,
              caret: "initial",
              animations: "disabled",
            });
          }
        }
        await imageTrigger.click();
        await expect(dialog).toBeVisible();
        await page.screenshot({
          path: `${folder}/detail__${locale}__${theme}__${viewport}__modal.png`,
          caret: "initial",
          animations: "disabled",
        });
        await dialog.getByRole("button", { name: messages.common.close, exact: true }).click();
        await expect(dialog).toBeHidden();
        for (const region of [
          "top",
          "variants",
          ...(viewport === "mobile" ? ["variants-end"] : []),
          "shipping",
          "reviews",
          "modal",
        ]) {
          manifest.push({
            actor: "guest",
            locale,
            theme,
            viewport: size,
            state: region,
            route: `/${locale}/catalog/${product.id}`,
            screenshot: `product-detail-screenshots/detail__${locale}__${theme}__${viewport}__${region}.png`,
            captured_at: new Date().toISOString(),
          });
        }
      }
    }
    expect(errors).toEqual([]);
    await writeFile(
      `../../handoff/prd-02-completion-2026-10-12/product-detail-${locale}-manifest.json`,
      JSON.stringify(manifest, null, 2),
    );
  });
}

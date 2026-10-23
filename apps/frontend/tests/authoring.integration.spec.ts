import { writeFile } from "node:fs/promises";
import { test, expect, type Page, type Locator } from "@playwright/test";
import { z } from "zod";
import en from "../messages/en.json" with { type: "json" };
import fa from "../messages/fa.json" with { type: "json" };
import {
  productSchema,
  variantSchema,
  editorSchema,
} from "../src/features/catalog/schemas/catalog-management.schema";
import {
  publicProductPageSchema,
  publicProductSchema,
} from "../src/features/catalog/schemas/public-catalog.schema";

async function perform(page: Page, action: string, button: Locator) {
  const pending = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes(`/api/bff/catalog/studio/${action}`),
  );
  await button.click();
  const response = await pending;
  expect(response.status(), action).toBe(200);
  return response;
}
for (const [locale, messages] of [
  ["en", en],
  ["fa", fa],
] as const) {
  test(`${locale}: producer uploads, authors, corrects and publishes a complete product and revises its variants through real forms`, async ({
    page,
    request,
    browser,
  }) => {
    test.setTimeout(240_000);
    const t = messages.catalogManagement;
    const api = "http://127.0.0.1:8001/api/v1/catalog/public/products/";
    const template = publicProductPageSchema.parse(await (await request.get(api)).json())
      .results[0];
    if (!template?.image_urls[0] || !template.image_urls[1])
      throw new Error("Scanned media fixture missing");
    const media = await Promise.all(
      template.image_urls.map(async (url) => {
        const response = await request.get(url);
        expect(response.status()).toBe(200);
        return response.body();
      }),
    );
    const productImage = media[0],
      variantImage = media[1];
    if (!productImage || !variantImage) throw new Error("Media bytes missing");
    const name = `Authored product ${locale}`,
      skus = [`AUTH-${locale}-42`, `AUTH-${locale}-43`] as const;
    await page.goto(`/${locale}/login`);
    await page
      .getByLabel(messages.accounts.register.fields.mobile, { exact: true })
      .fill("09120000002");
    await page
      .getByLabel(messages.accounts.register.fields.password, { exact: true })
      .fill("Catalog-e2e-password-2026!");
    await page.getByRole("button", { name: messages.accounts.login.submit, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/account$`), { timeout: 30_000 });
    await page.goto(`/${locale}/account/catalog`);
    await page.getByLabel(t.name, { exact: true }).fill(name);
    await page.getByLabel(t.category, { exact: true }).selectOption(template.category);
    await page.getByLabel("جنس *", { exact: true }).selectOption("leather");
    await page
      .getByLabel(t.description, { exact: true })
      .fill("Original authored wholesale product description");
    const invalidUpload = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/api/bff/catalog/studio/upload"),
    );
    await page.getByLabel(t.images, { exact: true }).setInputFiles({
      name: "too-small.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGNkYPjPgA0wYRUdtBIAy0MBD1YkjLoAAAAASUVORK5CYII=",
        "base64",
      ),
    });
    expect((await invalidUpload).status()).toBe(400);
    await expect(page.getByText(t.saveError, { exact: true })).toBeVisible();
    const upload = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/api/bff/catalog/studio/upload"),
    );
    await page.getByLabel(t.images, { exact: true }).setInputFiles({
      name: "authoring-product.png",
      mimeType: "image/png",
      buffer: productImage,
    });
    const uploaded = await upload;
    expect(uploaded.status()).toBe(200);
    const stored = z
      .object({ id: z.uuid(), scan_status: z.literal("clean") })
      .parse(await uploaded.json());
    const created = productSchema.parse(
      await (
        await perform(
          page,
          "product-save",
          page.getByRole("button", { name: t.createProduct, exact: true }),
        )
      ).json(),
    );
    expect(created).toMatchObject({
      name,
      status: "draft",
      brand: "",
      manufacturer_model: "",
      images: [stored.id],
    });
    const route = `/${locale}/account/catalog/${created.id}`;
    await expect(page).toHaveURL(new RegExp(`${route}$`));
    expect((await request.get(`${api}${created.id}/`)).status()).toBe(404);
    const incomplete = page.getByRole("region", { name: t.checklist.title, exact: true });
    await expect(incomplete.getByRole("status")).toHaveText(t.checklist.blocked);
    await expect(page.getByRole("button", { name: t.submitReview, exact: true })).toBeDisabled();
    const newVariant = page
      .locator("#variants")
      .getByRole("form", { name: t.newVariant, exact: true });
    await newVariant.getByLabel(t.sku, { exact: true }).fill(skus[0]);
    await newVariant.getByLabel("رنگ *", { exact: true }).selectOption("black");
    await newVariant.getByLabel("سایز *", { exact: true }).fill("42");
    const variantUpload = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/api/bff/catalog/studio/upload"),
    );
    await newVariant.getByLabel(t.variantImages, { exact: true }).setInputFiles({
      name: "authoring-variant.png",
      mimeType: "image/png",
      buffer: variantImage,
    });
    const variantUploaded = await variantUpload;
    expect(variantUploaded.status()).toBe(200);
    const variantFile = z
      .object({ id: z.uuid(), scan_status: z.literal("clean") })
      .parse(await variantUploaded.json());
    expect(variantFile.id).not.toBe(stored.id);
    const first = variantSchema.parse(
      await (
        await perform(
          page,
          "variant-save",
          newVariant.getByRole("button", { name: t.addVariant, exact: true }),
        )
      ).json(),
    );
    expect(first.images).toEqual([variantFile.id]);
    await newVariant.getByLabel(t.sku, { exact: true }).fill(skus[0]);
    await newVariant.getByLabel("رنگ *", { exact: true }).selectOption("brown");
    await newVariant.getByLabel("سایز *", { exact: true }).fill("43");
    const duplicate = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/api/bff/catalog/studio/variant-save"),
    );
    await newVariant.getByRole("button", { name: t.addVariant, exact: true }).click();
    expect((await duplicate).status()).toBe(400);
    await expect(newVariant.getByRole("alert")).toContainText(t.saveError);
    const editorUrl = `/api/bff/catalog/studio/editor?id=${created.id}`;
    expect(
      editorSchema.parse(await (await page.request.get(editorUrl)).json()).variants,
    ).toHaveLength(1);
    await newVariant.getByLabel(t.sku, { exact: true }).fill(skus[1]);
    const second = variantSchema.parse(
      await (
        await perform(
          page,
          "variant-save",
          newVariant.getByRole("button", { name: t.addVariant, exact: true }),
        )
      ).json(),
    );
    expect(second.images).toEqual([]);
    expect(second.effective_images).toEqual([stored.id]);
    const sales = page.locator("#salesAndPricing");
    await sales.getByLabel(t.freeMixMinimum, { exact: true }).fill("2");
    await sales.getByLabel(t.minimumQuantity, { exact: true }).fill("2");
    const priceInput = sales.getByLabel(t.unitPriceToman, { exact: true });
    await priceInput.fill("0");
    await sales.getByRole("button", { name: t.saveSalesPlan, exact: true }).click();
    await expect(priceInput).toBeFocused();
    expect(
      await priceInput.evaluate(
        (input) => input instanceof HTMLInputElement && input.validity.rangeUnderflow,
      ),
    ).toBe(true);
    await priceInput.fill("125000");
    await sales.getByRole("button", { name: t.addPack, exact: true }).click();
    await sales.getByLabel(t.packCode, { exact: true }).fill("pair");
    await sales.getByLabel(t.packName, { exact: true }).fill("Two-SKU pair");
    for (const sku of skus) await sales.getByLabel(sku, { exact: true }).fill("1");
    async function rejectSales(path: string, input: Locator, message: string) {
      const pending = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().includes("/api/bff/catalog/studio/sales-save"),
      );
      await sales.getByRole("button", { name: t.saveSalesPlan, exact: true }).click();
      const response = await pending;
      expect(response.status()).toBe(400);
      const result = z
        .object({ fields: z.record(z.string(), z.unknown()) })
        .parse(await response.json());
      expect(Object.keys(result.fields)).toContain(path);
      await expect(input).toHaveAttribute("aria-invalid", "true");
      await expect(input).toBeFocused();
      await expect(sales.getByText(message, { exact: true })).toBeVisible();
    }
    const minimum = sales.getByLabel(t.minimumQuantity, { exact: true });
    await minimum.fill("1");
    await rejectSales("tiers.0.min_quantity", minimum, t.pricingValidation.minimum);
    await minimum.fill("2");
    await sales.getByRole("button", { name: t.addTier, exact: true }).click();
    const nextMinimum = sales.getByLabel(t.minimumQuantity, { exact: true }).nth(1);
    await nextMinimum.fill("2");
    await rejectSales("tiers.1.min_quantity", nextMinimum, t.pricingValidation.minimum);
    await nextMinimum.fill("3");
    const nextPrice = sales.getByLabel(t.unitPriceToman, { exact: true }).nth(1);
    await nextPrice.fill("130000");
    await rejectSales("tiers.1.unit_price_irr", nextPrice, t.pricingValidation.price);
    await nextPrice.fill("120000");
    const override = sales
      .getByLabel(t.variantOverride.replace("{sku}", skus[0]), { exact: true })
      .nth(1);
    await override.fill("140000");
    await rejectSales(
      `tiers.1.overrides.${first.id}.unit_price_irr`,
      override,
      t.pricingValidation.override,
    );
    const pricingManifest = [];
    for (const theme of ["light", "dark"] as const) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.getByRole("button", { name: messages.theme[theme], exact: true }).click();
      for (const [viewport, size] of [
        ["desktop", { width: 1440, height: 1000 }],
        ["mobile", { width: 390, height: 844 }],
      ] as const) {
        await page.setViewportSize(size);
        await override.scrollIntoViewIfNeeded();
        await expect(sales.getByText(t.pricingValidation.override, { exact: true })).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        const screenshot = `pricing-screenshots/override__${locale}__${theme}__${viewport}.png`;
        await page.screenshot({
          path: `../../handoff/prd-02-completion-2026-10-12/${screenshot}`,
          animations: "disabled",
        });
        pricingManifest.push({
          actor: "manufacturer",
          locale,
          theme,
          viewport: size,
          route,
          state: "invalid-effective-override",
          screenshot,
          captured_at: new Date().toISOString(),
          render_mode: "production",
        });
      }
    }
    await writeFile(
      `../../handoff/prd-02-completion-2026-10-12/pricing-${locale}-manifest.json`,
      JSON.stringify(pricingManifest, null, 2),
    );
    await override.fill("120000");
    await perform(
      page,
      "sales-save",
      sales.getByRole("button", { name: t.saveSalesPlan, exact: true }),
    );
    for (const sku of skus) {
      const supply = page.locator("#supply").getByRole("form", { name: sku, exact: true });
      await supply.getByLabel(t.supplyMode, { exact: true }).selectOption("ready");
      await supply.getByLabel(t.readyStock, { exact: true }).fill("20");
      await perform(
        page,
        "supply-save",
        supply.getByRole("button", { name: t.saveSupply, exact: true }),
      );
    }
    const shipping = page.getByRole("form", { name: t.shipping, exact: true });
    await shipping.getByRole("checkbox", { name: /ارسال سراسری/ }).check();
    for (const [label, value] of [
      [t.package.weight, "900"],
      [t.package.length, "330"],
      [t.package.width, "210"],
      [t.package.height, "130"],
      [t.package.count, "1"],
    ] as const) {
      const fields = shipping.getByLabel(label, { exact: true });
      for (let index = 0; index < 2; index++) await fields.nth(index).fill(value);
    }
    await perform(
      page,
      "shipping-save",
      shipping.getByRole("button", { name: t.saveShipping, exact: true }),
    );
    await expect(incomplete.getByRole("status")).toHaveText(t.checklist.ready);
    const ready = editorSchema.parse(await (await page.request.get(editorUrl)).json());
    expect(ready.readiness.ready).toBe(true);
    expect(ready.shipping?.packages).toHaveLength(2);
    await page.getByRole("button", { name: t.submitReview, exact: true }).click();
    await perform(page, "submit", page.getByRole("button", { name: t.confirmSubmit, exact: true }));
    await expect(page.getByText(t.statuses.pending, { exact: true })).toBeVisible();
    await expect(page.locator("#baseProduct").getByLabel(t.name, { exact: true })).toBeDisabled();
    expect(
      (
        await page.request.post(`/api/bff/catalog/studio/product-save?id=${created.id}`, {
          headers: { Origin: "http://localhost:3100" },
          data: {
            business: created.business,
            category: created.category,
            name: "Unauthorized pending change",
            description: created.description,
            brand: "",
            manufacturer_model: "",
            attributes: created.attributes,
            images: created.images,
          },
        })
      ).status(),
    ).toBe(409);
    const context = await browser.newContext();
    try {
      const operator = await context.newPage();
      await operator.goto(`http://localhost:3100/${locale}/login`);
      await operator
        .getByLabel(messages.accounts.register.fields.mobile, { exact: true })
        .fill("09120000004");
      await operator
        .getByLabel(messages.accounts.register.fields.password, { exact: true })
        .fill("Operator-e2e-password-2026!");
      await operator
        .getByRole("button", { name: messages.accounts.login.submit, exact: true })
        .click();
      await expect(operator).toHaveURL(new RegExp(`/${locale}/account$`), { timeout: 30_000 });
      const manifest = [];
      for (const decision of ["changes_requested", "published"] as const) {
        await operator.bringToFront();
        await operator.goto(`http://localhost:3100/${locale}/account/catalog/operations`);
        await operator
          .getByRole("group", { name, exact: true })
          .getByRole("button", { name: t.claimAndReview, exact: true })
          .click();
        await expect(operator.getByRole("heading", { level: 1, name, exact: true })).toBeVisible();
        await expect(
          operator.getByRole("heading", { name: t.revisionDiff.packaging, exact: true }),
        ).toBeVisible();
        const audience = operator.getByRole("button", { name: t.preview.retailer, exact: true });
        await audience.click();
        await expect(
          operator.getByRole("table", { name: messages.catalog.wholesale.caption, exact: true }),
        ).toContainText(new Intl.NumberFormat(locale).format(125000));
        for (const theme of ["light", "dark"] as const) {
          await context.addCookies([
            { name: "directsourcing-theme-v1", value: theme, url: "http://localhost:3100" },
          ]);
          for (const [viewport, size] of [
            ["desktop", { width: 1440, height: 1000 }],
            ["mobile", { width: 390, height: 844 }],
          ] as const) {
            await operator.setViewportSize(size);
            await operator.reload();
            const packageHeading = operator.getByRole("heading", {
              name: t.revisionDiff.packaging,
              exact: true,
            });
            await expect(packageHeading).toBeVisible();
            await packageHeading.scrollIntoViewIfNeeded();
            await operator.evaluate(() => document.fonts.ready);
            expect(
              await operator.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            ).toBe(true);
            const file = `operator__${locale}__${theme}__${viewport}__${decision}.png`;
            await operator.screenshot({
              path: `../../handoff/prd-02-completion-2026-10-12/authoring-screenshots/${file}`,
              animations: "disabled",
            });
            manifest.push({
              actor: "assigned operator",
              locale,
              theme,
              viewport: size,
              route: new URL(operator.url()).pathname,
              state: decision,
              screenshot: `authoring-screenshots/${file}`,
              captured_at: new Date().toISOString(),
              render_mode: "production",
            });
          }
        }
        await operator.getByLabel(t.decision, { exact: true }).selectOption(decision);
        await operator
          .getByLabel(t.reasonCode, { exact: true })
          .selectOption(decision === "published" ? "approved" : "content_incomplete");
        await operator
          .getByLabel(t.reason, { exact: true })
          .fill(
            decision === "published"
              ? "Content, images, packaging and prices approved"
              : "Add a more detailed product description",
          );
        await perform(
          operator,
          "review",
          operator.getByRole("button", { name: t.recordDecision, exact: true }),
        );
        await expect(operator).toHaveURL(new RegExp(`/${locale}/account/catalog/operations$`));
        if (decision === "changes_requested") {
          await page.bringToFront();
          await page.goto(route);
          await expect(
            page.getByText("Add a more detailed product description", { exact: true }),
          ).toBeVisible();
          const profile = page.getByRole("form", { name: t.baseProduct, exact: true });
          await profile
            .getByLabel(t.description, { exact: true })
            .fill("Corrected detailed wholesale product description");
          await perform(
            page,
            "product-save",
            profile.getByRole("button", { name: t.save, exact: true }),
          );
          await page.getByRole("button", { name: t.submitReview, exact: true }).click();
          await perform(
            page,
            "submit",
            page.getByRole("button", { name: t.confirmSubmit, exact: true }),
          );
        }
      }
      await writeFile(
        `../../handoff/prd-02-completion-2026-10-12/authoring-${locale}-manifest.json`,
        JSON.stringify(manifest, null, 2),
      );
      const publishedResponse = await request.get(`${api}${created.id}/`);
      expect(publishedResponse.status()).toBe(200);
      const published = publicProductSchema.parse(await publishedResponse.json());
      expect(published.name).toBe(name);
      expect(published.description).toBe("Corrected detailed wholesale product description");
      expect(published.variants.map((variant) => variant.sku).sort()).toEqual([...skus].sort());
      expect(published.sale_methods.sort()).toEqual(["fixed_pack", "free_mix"]);
      await page.bringToFront();
      await page.goto(route);
      const revisionForm = page.getByRole("form", { name: t.contentRevision, exact: true });
      await revisionForm
        .getByRole("group", { name: skus[1], exact: true })
        .getByRole("button", { name: t.removeVariantFromRevision, exact: true })
        .click();
      await revisionForm.getByRole("button", { name: t.addVariant, exact: true }).click();
      const thirdSku = `AUTH-${locale}-44`;
      await revisionForm
        .getByRole("group", { name: t.newVariant, exact: true })
        .getByLabel(t.sku, { exact: true })
        .fill(thirdSku);
      const third = revisionForm.getByRole("group", { name: thirdSku, exact: true });
      await third.getByLabel("رنگ *", { exact: true }).selectOption("brown");
      await third.getByLabel("سایز *", { exact: true }).fill("44");
      await third.getByLabel(t.readyStock, { exact: true }).fill("15");
      for (const [label, value] of [
        [t.package.weight, "900"],
        [t.package.length, "330"],
        [t.package.width, "210"],
        [t.package.height, "130"],
        [t.package.count, "1"],
      ] as const)
        await third.getByLabel(label, { exact: true }).fill(value);
      await perform(
        page,
        "revision-save",
        revisionForm.getByRole("button", { name: t.createRevision, exact: true }),
      );
      await perform(
        page,
        "revision-submit",
        page.getByRole("button", { name: t.submitRevision, exact: true }),
      );
      expect(
        publicProductSchema
          .parse(await (await request.get(`${api}${created.id}/`)).json())
          .variants.map((variant) => variant.sku)
          .sort(),
      ).toEqual([...skus].sort());
      await operator.bringToFront();
      await operator.goto(`http://localhost:3100/${locale}/account/catalog/operations`);
      await operator
        .getByRole("heading", { name: t.revisionReviews, exact: true })
        .locator("..")
        .getByRole("button", { name: t.claimAndReview, exact: true })
        .click();
      const added = operator.getByRole("region", { name: thirdSku, exact: true });
      await expect(added.getByText(t.revisionDiff.added, { exact: true })).toBeVisible();
      await expect(
        added.getByText(new Intl.NumberFormat(locale).format(900), { exact: true }),
      ).toBeVisible();
      await expect(
        operator
          .getByRole("region", { name: skus[1], exact: true })
          .getByText(t.revisionDiff.removed, { exact: true }),
      ).toBeVisible();
      expect(
        await operator.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBe(true);
      for (const state of ["removed", "added", "package"] as const) {
        if (state === "removed")
          await operator
            .getByRole("region", { name: skus[1], exact: true })
            .getByRole("heading", { name: skus[1], exact: true })
            .scrollIntoViewIfNeeded();
        else if (state === "added")
          await added
            .getByRole("heading", { name: thirdSku, exact: true })
            .scrollIntoViewIfNeeded();
        else
          await added
            .getByRole("region", { name: t.shipping, exact: true })
            .scrollIntoViewIfNeeded();
        const file = `revision__${locale}__dark__mobile__${state}.png`;
        await operator.screenshot({
          path: `../../handoff/prd-02-completion-2026-10-12/authoring-screenshots/${file}`,
          animations: "disabled",
        });
        manifest.push({
          actor: "assigned operator",
          locale,
          theme: "dark",
          viewport: { width: 390, height: 844 },
          route: new URL(operator.url()).pathname,
          state,
          screenshot: `authoring-screenshots/${file}`,
          captured_at: new Date().toISOString(),
          render_mode: "production",
        });
      }
      await writeFile(
        `../../handoff/prd-02-completion-2026-10-12/authoring-${locale}-manifest.json`,
        JSON.stringify(manifest, null, 2),
      );
      await operator.getByLabel(t.decision, { exact: true }).selectOption("approved");
      await operator.getByLabel(t.reasonCode, { exact: true }).selectOption("approved");
      await operator
        .getByLabel(t.reason, { exact: true })
        .fill("New variant supply/package complete; previous SKU retained in history");
      await perform(
        operator,
        "revision-review",
        operator.getByRole("button", { name: t.recordDecision, exact: true }),
      );
      const revised = publicProductSchema.parse(
        await (await request.get(`${api}${created.id}/`)).json(),
      );
      expect(revised.variants.map((variant) => variant.sku).sort()).toEqual(
        [skus[0], thirdSku].sort(),
      );
      const finalEditor = editorSchema.parse(await (await page.request.get(editorUrl)).json());
      expect(finalEditor.variants.find((variant) => variant.id === second.id)?.is_active).toBe(
        false,
      );
      expect(finalEditor.supplies[first.id]?.ready_stock).toBe(20);
      expect(finalEditor.sales_plan?.tiers[0]?.unit_price_irr).toBe(1250000);
      await page.bringToFront();
      await page.goto(route);
      await page
        .locator("#publication")
        .getByLabel(t.reason, { exact: true })
        .fill("Finish isolated authoring journey");
      await perform(
        page,
        "deactivate",
        page.getByRole("button", { name: t.deactivate, exact: true }),
      );
      expect((await request.get(`${api}${created.id}/`)).status()).toBe(404);
    } finally {
      await page.close();
      await context.close();
    }
  });
}

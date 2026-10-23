import { writeFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { productSchema } from "../src/features/catalog/schemas/catalog-management.schema";
import en from "../messages/en.json" with { type: "json" };
import fa from "../messages/fa.json" with { type: "json" };
import {
  publicProductPageSchema,
  productPreviewSchema,
} from "../src/features/catalog/schemas/public-catalog.schema";

for (const [locale, messages] of [
  ["en", en],
  ["fa", fa],
] as const) {
  test(`${locale}: producer previews saved public and retailer content with an authoritative publication checklist`, async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const products = publicProductPageSchema.parse(
      await (await request.get("http://127.0.0.1:8001/api/v1/catalog/public/products/")).json(),
    );
    const product = products.results[0];
    if (!product) throw new Error("Product fixture missing");
    const endpoint = `/api/bff/catalog/studio/preview?id=${product.id}`;
    expect((await request.get(endpoint)).status()).toBe(401);
    await page.goto(`/${locale}/login`);
    await page
      .getByLabel(messages.accounts.register.fields.mobile, { exact: true })
      .fill("09120000002");
    await page
      .getByLabel(messages.accounts.register.fields.password, { exact: true })
      .fill("Catalog-e2e-password-2026!");
    await page.getByRole("button", { name: messages.accounts.login.submit, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/account$`), { timeout: 30_000 });
    const route = `/${locale}/account/catalog/${product.id}`;
    const manifest = [];
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
        const preview = page.locator("#preview");
        const content = preview.getByRole("article", {
          name: messages.catalogManagement.preview.content,
        });
        await expect(content.getByRole("heading", { name: product.name, exact: true })).toBeVisible(
          { timeout: 30_000 },
        );
        const response = await page.request.get(endpoint);
        expect(response.status()).toBe(200);
        expect(response.headers()["cache-control"]).toContain("no-store");
        const saved = productPreviewSchema.parse(await response.json());
        expect(saved.variants).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              sku: "AF-101-BLK-42",
              supply: expect.objectContaining({ ready_stock: 12, production_cap: 40 }),
            }),
          ]),
        );
        const checklist = page.getByRole("region", {
          name: messages.catalogManagement.checklist.title,
          exact: true,
        });
        await expect(
          checklist.getByText(messages.catalogManagement.checklist.complete, { exact: true }),
        ).toHaveCount(6);
        await expect(checklist.getByRole("status")).toHaveText(
          messages.catalogManagement.checklist.ready,
        );
        for (const mode of ["public", "retailer"] as const) {
          const control = preview.getByRole("button", {
            name: messages.catalogManagement.preview[mode],
            exact: true,
          });
          await control.focus();
          await page.keyboard.press("Space");
          await expect(control).toHaveAttribute("aria-pressed", "true");
          const table = content.getByRole("table", {
            name: messages.catalog.wholesale.caption,
            exact: true,
          });
          if (mode === "public") {
            await expect(table).toHaveCount(0);
            await expect(
              content.getByText(messages.catalog.priceProtected, { exact: true }),
            ).toBeVisible();
            await expect(content).not.toContainText(new Intl.NumberFormat(locale).format(125000));
          } else {
            await expect(table).toContainText(new Intl.NumberFormat(locale).format(125000));
            await expect(
              content.getByText(messages.catalog.priceProtected, { exact: true }),
            ).toHaveCount(0);
          }
          const image = content.getByRole("img", { name: product.name, exact: true });
          await expect(image).toBeVisible();
          await expect
            .poll(() =>
              image.evaluate(
                (element) =>
                  element instanceof HTMLImageElement &&
                  element.complete &&
                  element.naturalWidth >= 800,
              ),
            )
            .toBe(true);
          await page.evaluate(() => document.fonts.ready);
          await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
          await preview
            .getByRole("heading", { name: messages.catalogManagement.preview.title, exact: true })
            .scrollIntoViewIfNeeded();
          const file = `producer__${locale}__${theme}__${viewport}__${mode}.png`;
          await page.screenshot({
            path: `../../handoff/prd-02-completion-2026-10-12/preview-screenshots/${file}`,
            animations: "disabled",
          });
          manifest.push({
            actor: "manufacturer",
            locale,
            theme,
            viewport: size,
            route,
            state: mode,
            render_mode: "production",
            captured_at: new Date().toISOString(),
            screenshot: `preview-screenshots/${file}`,
          });
          if (mode === "retailer") {
            await table.scrollIntoViewIfNeeded();
            const priceFile = `prices__${locale}__${theme}__${viewport}.png`;
            await page.screenshot({
              path: `../../handoff/prd-02-completion-2026-10-12/preview-screenshots/${priceFile}`,
              animations: "disabled",
            });
            manifest.push({
              actor: "manufacturer",
              locale,
              theme,
              viewport: size,
              route,
              state: "retailer-prices",
              render_mode: "production",
              captured_at: new Date().toISOString(),
              screenshot: `preview-screenshots/${priceFile}`,
            });
          }
        }
        const trigger = preview.getByRole("button", {
          name: messages.catalog.variants.viewImages.replace("{sku}", "AF-101-BLK-42"),
          exact: true,
        });
        await trigger.focus();
        await page.keyboard.press("Space");
        await expect(trigger).toHaveAttribute("aria-expanded", "true");
        const next = preview
          .getByRole("button", { name: messages.catalog.gallery.next, exact: true })
          .last();
        await next.click();
        await expect(next).toBeDisabled();
        const variantImage = preview
          .getByRole("img", { name: "AF-101-BLK-42", exact: true })
          .last();
        await expect
          .poll(() =>
            variantImage.evaluate(
              (element) =>
                element instanceof HTMLImageElement &&
                element.complete &&
                element.naturalWidth >= 800,
            ),
          )
          .toBe(true);
        const galleryFile = `variant-gallery__${locale}__${theme}__${viewport}.png`;
        await page.screenshot({
          path: `../../handoff/prd-02-completion-2026-10-12/preview-screenshots/${galleryFile}`,
          animations: "disabled",
        });
        manifest.push({
          actor: "manufacturer",
          locale,
          theme,
          viewport: size,
          route,
          state: "variant-gallery",
          render_mode: "production",
          captured_at: new Date().toISOString(),
          screenshot: `preview-screenshots/${galleryFile}`,
        });
        await trigger.focus();
        await page.keyboard.press("Space");
        await expect(trigger).toHaveAttribute("aria-expanded", "false");
        await checklist.scrollIntoViewIfNeeded();
        await page.screenshot({
          path: `../../handoff/prd-02-completion-2026-10-12/preview-screenshots/checklist__${locale}__${theme}__${viewport}.png`,
          animations: "disabled",
        });
        manifest.push({
          actor: "manufacturer",
          locale,
          theme,
          viewport: size,
          route,
          state: "checklist-ready",
          render_mode: "production",
          captured_at: new Date().toISOString(),
          screenshot: `preview-screenshots/checklist__${locale}__${theme}__${viewport}.png`,
        });
      }
    }
    await page.goto(`/${locale}/account/catalog`);
    const draftName = `Incomplete preview ${locale}`;
    await page.getByLabel(messages.catalogManagement.name, { exact: true }).fill(draftName);
    await page
      .getByLabel(messages.catalogManagement.category, { exact: true })
      .selectOption(product.category);
    await page.getByLabel("جنس *", { exact: true }).selectOption("leather");
    await page
      .getByLabel(messages.catalogManagement.description, { exact: true })
      .fill("Saved draft awaiting its image, variants and sales settings");
    const creation = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/api/bff/catalog/studio/product-save"),
      { timeout: 15_000 },
    );
    await page
      .getByRole("button", { name: messages.catalogManagement.createProduct, exact: true })
      .click();
    const createdResponse = await creation;
    expect(createdResponse.status()).toBe(200);
    const created = productSchema.parse(await createdResponse.json());
    await expect(page).toHaveURL(new RegExp(`/${locale}/account/catalog/${created.id}$`));
    const editorResponse = await page.request.get(
      `/api/bff/catalog/studio/editor?id=${created.id}`,
    );
    expect(editorResponse.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: draftName, exact: true })).toBeVisible(
      { timeout: 30_000 },
    );
    const incomplete = page.getByRole("region", {
      name: messages.catalogManagement.checklist.title,
      exact: true,
    });
    await expect(incomplete.getByRole("status")).toHaveText(
      messages.catalogManagement.checklist.blocked,
    );
    await expect(
      page.getByRole("button", { name: messages.catalogManagement.submitReview, exact: true }),
    ).toBeDisabled();
    const draftId = new URL(page.url()).pathname.split("/").at(-1);
    if (!draftId) throw new Error("Draft id missing");
    const rejected = await page.request.post(`/api/bff/catalog/studio/submit?id=${draftId}`, {
      headers: { Origin: "http://localhost:3100" },
      data: {},
    });
    expect(rejected.status()).toBe(400);
    const draftPreviewResponse = await page.request.get(
      `/api/bff/catalog/studio/preview?id=${draftId}`,
    );
    expect(draftPreviewResponse.status()).toBe(200);
    expect(productPreviewSchema.parse(await draftPreviewResponse.json()).published_at).toBeNull();
    expect(
      (
        await request.get(`http://127.0.0.1:8001/api/v1/catalog/public/products/${draftId}/`)
      ).status(),
    ).toBe(404);
    for (const state of ["top", "bottom"] as const) {
      if (state === "top")
        await incomplete
          .getByRole("heading", { name: messages.catalogManagement.checklist.title, exact: true })
          .scrollIntoViewIfNeeded();
      else
        await page
          .getByRole("button", { name: messages.catalogManagement.submitReview, exact: true })
          .scrollIntoViewIfNeeded();
      const file = `incomplete__${locale}__dark__mobile__${state}.png`;
      await page.screenshot({
        path: `../../handoff/prd-02-completion-2026-10-12/preview-screenshots/${file}`,
        animations: "disabled",
      });
      manifest.push({
        actor: "manufacturer",
        locale,
        theme: "dark",
        viewport: { width: 390, height: 844 },
        route: new URL(page.url()).pathname,
        state: `checklist-incomplete-${state}`,
        render_mode: "production",
        captured_at: new Date().toISOString(),
        screenshot: `preview-screenshots/${file}`,
      });
    }
    const deleteButton = page.getByRole("button", {
      name: messages.catalogManagement.deleteDraft,
      exact: true,
    });
    await deleteButton.focus();
    await page.keyboard.press("Space");
    const dialog = page.getByRole("dialog", { name: messages.catalogManagement.deleteDraft });
    await expect(dialog).toBeVisible();
    const retainedDialog = await dialog.elementHandle();
    if (!retainedDialog) throw new Error("Private confirmation missing");
    const hiddenSynchronously = await page.evaluate(() => {
      const popup = document.querySelector('[role="dialog"]');
      window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
      return {
        visibility: popup && getComputedStyle(popup).visibility,
        inert: popup?.closest("[inert]") !== null,
        ancestors:
          popup &&
          Array.from(
            (function* () {
              for (let node: Element | null = popup; node; node = node.parentElement) yield node;
            })(),
          ).map((node) => ({
            tag: node.tagName,
            class: node.className,
            style: node.getAttribute("style"),
            inert: node.hasAttribute("inert"),
          })),
      };
    });
    await writeFile(
      `../../handoff/prd-02-completion-2026-10-12/portal-${locale}-diagnostic.json`,
      JSON.stringify(hiddenSynchronously, null, 2),
    );
    expect(hiddenSynchronously).toMatchObject({ visibility: "hidden", inert: true });
    await expect(dialog).toBeHidden();
    expect(await retainedDialog.evaluate((element) => element.isConnected)).toBe(true);
    await page.evaluate(() =>
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })),
    );
    await expect(dialog).toBeVisible();
    expect(await retainedDialog.evaluate((element) => element.isConnected)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(deleteButton).toBeFocused();
    await expect(page).not.toHaveURL(/modal=/u);
    await writeFile(
      `../../handoff/prd-02-completion-2026-10-12/preview-${locale}-manifest.json`,
      JSON.stringify(manifest, null, 2),
    );
  });
}

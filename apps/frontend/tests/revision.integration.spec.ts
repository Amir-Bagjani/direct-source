import { writeFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import en from "../messages/en.json" with { type: "json" };
import fa from "../messages/fa.json" with { type: "json" };
import {
  productPreviewSchema,
  publicProductPageSchema,
} from "../src/features/catalog/schemas/public-catalog.schema";
import {
  revisionReviewSchema,
  revisionSchema,
} from "../src/features/catalog/schemas/catalog-management.schema";

for (const [locale, messages] of [
  ["en", en],
  ["fa", fa],
] as const) {
  test(`${locale}: producer submits a content revision and assigned operator compares images before approval`, async ({
    page,
    browser,
    request,
  }) => {
    test.setTimeout(180_000);
    const origin = "http://127.0.0.1:8001/api/v1/catalog/public/products/";
    const product = publicProductPageSchema.parse(await (await request.get(origin)).json())
      .results[0];
    if (!product) throw new Error("Published fixture missing");
    const proposedName = `Revised leather shoe ${locale}`;
    await page.goto(`/${locale}/login`);
    await page
      .getByLabel(messages.accounts.register.fields.mobile, { exact: true })
      .fill("09120000002");
    await page
      .getByLabel(messages.accounts.register.fields.password, { exact: true })
      .fill("Catalog-e2e-password-2026!");
    await page.getByRole("button", { name: messages.accounts.login.submit, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/account$`), { timeout: 30_000 });
    await page.goto(`/${locale}/account/catalog/${product.id}`);
    const previewEndpoint = `/api/bff/catalog/studio/preview?id=${product.id}`;
    const previousPlan = productPreviewSchema.parse(
      await (await page.request.get(previewEndpoint)).json(),
    ).wholesale;
    await page.getByLabel(messages.catalogManagement.name, { exact: true }).fill(proposedName);
    await page
      .locator("#baseProduct")
      .getByRole("button", { name: messages.catalogManagement.moveImageLater, exact: true })
      .first()
      .click();
    const savedResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/api/bff/catalog/studio/revision-save"),
    );
    await page
      .getByRole("button", { name: messages.catalogManagement.createRevision, exact: true })
      .click();
    const saved = await savedResponse;
    expect(saved.status()).toBe(200);
    const revision = revisionSchema.parse(await saved.json());
    expect(revision.proposed.profile.images).toEqual([...revision.before.profile.images].reverse());
    await page
      .getByRole("button", { name: messages.catalogManagement.submitRevision, exact: true })
      .click();
    await expect(
      page.getByText(messages.catalogManagement.revisionStatuses.pending, { exact: true }),
    ).toBeVisible();
    expect(
      publicProductPageSchema
        .parse(await (await request.get(origin)).json())
        .results.find((row) => row.id === product.id)?.name,
    ).toBe(product.name);
    const context = await browser.newContext();
    const operator = await context.newPage();
    try {
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
      expect(
        (await operator.request.get(`/api/bff/catalog/studio/revision?id=${revision.id}`)).status(),
      ).toBe(404);
      await operator.goto(`http://localhost:3100/${locale}/account/catalog/operations`);
      await expect(
        operator.getByRole("heading", {
          level: 1,
          name: messages.catalogManagement.operatorTitle,
          exact: true,
        }),
      ).toBeVisible({ timeout: 30_000 });
      const dashboard = await operator.request.get("/api/bff/catalog/studio/operator");
      expect(dashboard.status()).toBe(200);
      await operator
        .getByRole("heading", { name: messages.catalogManagement.revisionReviews, exact: true })
        .locator("..")
        .getByRole("button", { name: messages.catalogManagement.claimAndReview, exact: true })
        .click();
      const route = `/${locale}/account/catalog/operations/revisions/${revision.id}`;
      await expect(operator).toHaveURL(new RegExp(`${route}$`));
      const comparison = operator.getByRole("region", {
        name: messages.catalogManagement.revisionDiff.title,
        exact: true,
      });
      const manifest = [];
      let reviewedImagePath: string | undefined;
      for (const theme of ["light", "dark"] as const) {
        await context.addCookies([
          { name: "directsourcing-theme-v1", value: theme, url: "http://localhost:3100" },
        ]);
        for (const [viewport, size] of [
          ["desktop", { width: 1440, height: 1000 }],
          ["mobile", { width: 390, height: 844 }],
        ] as const) {
          await operator.setViewportSize(size);
          await operator.goto(`http://localhost:3100${route}`);
          await expect(comparison.getByText(proposedName, { exact: true })).toBeVisible();
          await expect(comparison.getByText(product.name, { exact: true })).toBeVisible();
          const images = comparison.getByRole("region", {
            name: messages.catalogManagement.images,
            exact: true,
          });
          for (const name of [product.name, proposedName]) {
            const image = images.getByRole("img", { name, exact: true });
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
          }
          reviewedImagePath =
            (await images
              .getByRole("img", { name: proposedName, exact: true })
              .getAttribute("src")) ?? undefined;
          if (!reviewedImagePath) throw new Error("Missing referenced image");
          const authorizedImage = await operator.request.get(reviewedImagePath);
          expect(authorizedImage.status()).toBe(200);
          await operator.evaluate(() => document.fonts.ready);
          expect(
            await operator.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
          for (const state of ["content", "images"] as const) {
            if (state === "content")
              await comparison
                .getByRole("heading", {
                  name: messages.catalogManagement.revisionDiff.title,
                  exact: true,
                })
                .scrollIntoViewIfNeeded();
            else await images.scrollIntoViewIfNeeded();
            const file = `operator__${locale}__${theme}__${viewport}__${state}.png`;
            await operator.screenshot({
              path: `../../handoff/prd-02-completion-2026-10-12/revision-screenshots/${file}`,
              animations: "disabled",
            });
            manifest.push({
              actor: "assigned operator",
              locale,
              theme,
              viewport: size,
              route,
              state,
              render_mode: "production",
              captured_at: new Date().toISOString(),
              screenshot: `revision-screenshots/${file}`,
            });
          }
        }
      }
      await writeFile(
        `../../handoff/prd-02-completion-2026-10-12/revision-${locale}-manifest.json`,
        JSON.stringify(manifest, null, 2),
      );
      await operator
        .getByLabel(messages.catalogManagement.decision, { exact: true })
        .selectOption("approved");
      await operator
        .getByLabel(messages.catalogManagement.reasonCode, { exact: true })
        .selectOption("approved");
      await operator
        .getByLabel(messages.catalogManagement.reason, { exact: true })
        .fill("Compared approved and proposed content and referenced images.");
      await operator
        .getByRole("button", { name: messages.catalogManagement.recordDecision, exact: true })
        .click();
      await expect(operator).toHaveURL(new RegExp(`/${locale}/account/catalog/operations$`));
      const after = publicProductPageSchema
        .parse(await (await request.get(origin)).json())
        .results.find((row) => row.id === product.id);
      expect(after?.name).toBe(proposedName);
      expect(after?.image_urls.map((url) => new URL(url).pathname)).toEqual(
        [...product.image_urls].reverse().map((url) => new URL(url).pathname),
      );
      expect(after?.variants.map(({ image_urls: _images, ...variant }) => variant)).toEqual(
        product.variants.map(({ image_urls: _images, ...variant }) => variant),
      );
      expect(
        productPreviewSchema.parse(await (await page.request.get(previewEndpoint)).json())
          .wholesale,
      ).toEqual(previousPlan);
      if (!reviewedImagePath) throw new Error("Missing reviewed image");
      expect((await operator.request.get(reviewedImagePath)).status()).toBe(404);
    } finally {
      try {
        const current = revisionReviewSchema.parse(
          await (
            await page.request.get(`/api/bff/catalog/studio/revision?id=${revision.id}`)
          ).json(),
        ).revision;
        const headers = { Origin: "http://localhost:3100" };
        if (current.status === "approved") {
          // Restore the shared fixture through the real revision workflow so other journeys stay independent.
          const restoreResponse = await page.request.post(
            `/api/bff/catalog/studio/revision-save?product=${product.id}`,
            { headers, data: { profile: revision.before.profile } },
          );
          expect(restoreResponse.status()).toBe(200);
          const restore = revisionSchema.parse(await restoreResponse.json());
          expect(
            (
              await page.request.post(`/api/bff/catalog/studio/revision-submit?id=${restore.id}`, {
                headers,
                data: {},
              })
            ).status(),
          ).toBe(200);
          expect(
            (
              await operator.request.post(
                `/api/bff/catalog/studio/revision-claim?id=${restore.id}`,
                { headers, data: {} },
              )
            ).status(),
          ).toBe(200);
          expect(
            (
              await operator.request.post(
                `/api/bff/catalog/studio/revision-review?id=${restore.id}`,
                {
                  headers,
                  data: {
                    decision: "approved",
                    code: "approved",
                    reason: "Restore isolated test fixture content",
                  },
                },
              )
            ).status(),
          ).toBe(200);
          expect(
            publicProductPageSchema
              .parse(await (await request.get(origin)).json())
              .results.find((row) => row.id === product.id)?.name,
          ).toBe(product.name);
        } else if (["draft", "pending", "changes_requested"].includes(current.status)) {
          expect(
            (
              await page.request.post(`/api/bff/catalog/studio/revision-cancel?id=${revision.id}`, {
                headers,
                data: { reason: "Close incomplete test journey" },
              })
            ).status(),
          ).toBe(200);
        }
      } finally {
        await context.close();
      }
    }
  });
}

import { test, expect } from "@playwright/test";
import en from "../messages/en.json" with { type: "json" };
import fa from "../messages/fa.json" with { type: "json" };

function containsPrice(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsPrice);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(
    ([key, nested]) =>
      ["representative_price_irr", "wholesale"].includes(key) || containsPrice(nested),
  );
}

for (const [locale, messages] of [
  ["en", en],
  ["fa", fa],
] as const) {
  test(`${locale}: public catalog keeps filters, exposes product/manufacturer SEO and no price`, async ({
    page,
    request,
  }) => {
    const api = await request.get("http://127.0.0.1:8001/api/v1/catalog/public/products/");
    expect(api.status()).toBe(200);
    const payload: unknown = await api.json();
    expect(containsPrice(payload)).toBe(false);
    const anonymousWholesale = await request.get("/api/bff/catalog/wholesale/access");
    expect(anonymousWholesale.status()).toBe(401);

    await page.goto(`/${locale}/catalog`);
    await expect(
      page.getByRole("heading", { level: 1, name: messages.catalog.title }),
    ).toBeVisible();
    await expect(page.getByText("کفش چرمی آفتاب", { exact: true })).toBeVisible();
    await page.getByLabel(messages.catalog.filters.search, { exact: true }).fill("كفش چرمي");
    await page.getByRole("button", { name: messages.catalog.filters.apply, exact: true }).click();
    await expect(page).toHaveURL(/q=%D9%83%D9%81%D8%B4/);
    await expect(page.getByText("کفش چرمی آفتاب", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "کفش چرمی آفتاب", exact: true }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "کفش چرمی آفتاب" })).toBeVisible();
    await expect(page.getByText("AF-101-BLK-42", { exact: true })).toBeVisible();
    await expect(page.getByText("ارسال سراسری", { exact: true })).toBeVisible();
    await expect(page.getByText(messages.catalog.priceProtected, { exact: true })).toBeVisible();
    await expect(page.getByText("02112345678", { exact: true })).toHaveCount(0);
    await expect(page.locator('link[rel="canonical"][href*="/catalog/"]').last()).toHaveAttribute(
      "href",
      /\/catalog\//,
    );
    expect(
      await page.locator('script[type="application/ld+json"]').evaluate((node) => node.textContent),
    ).toContain('"@type":"Product"');

    await page.getByRole("link", { name: "چرم آفتاب", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "چرم آفتاب" })).toBeVisible();
    await expect(page.getByText("کفش چرمی آفتاب", { exact: true })).toBeVisible();
    await expect(page.getByText("نشانی خصوصی تست", { exact: true })).toHaveCount(0);
    expect(
      await page.locator('script[type="application/ld+json"]').evaluate((node) => node.textContent),
    ).toContain('"@type":"Organization"');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
}

test("en: verified retailer sees identity-scoped wholesale prices and logout removes them", async ({
  page,
}) => {
  await page.goto("/en/login");
  await page.getByLabel(en.accounts.register.fields.mobile, { exact: true }).fill("09120000003");
  await page
    .getByLabel(en.accounts.register.fields.password, { exact: true })
    .fill("Retailer-e2e-password-2026!");
  await page.getByRole("button", { name: en.accounts.login.submit, exact: true }).click();
  await expect(page).toHaveURL(/\/en\/account$/u, { timeout: 30_000 });

  const catalogResponse = await page.goto("/en/catalog");
  expect(catalogResponse).not.toBeNull();
  const initialHtml = await catalogResponse!.text();
  expect(initialHtml).not.toContain("125,000");
  expect(initialHtml).not.toContain("1250000");

  await expect(page.getByText("From 125,000 toman", { exact: true })).toBeVisible();
  await expect(page.getByLabel(en.catalog.filters.priceMin, { exact: true })).toBeVisible();
  await page.getByLabel(en.catalog.filters.priceMin, { exact: true }).fill("130000");
  await page.getByRole("button", { name: en.catalog.filters.apply, exact: true }).click();
  await expect(page).toHaveURL(/price_min=130000/u);
  await expect(page.getByText(en.catalog.empty.title, { exact: true })).toBeVisible();

  await page.goto("/en/catalog");
  await page.getByRole("link", { name: "کفش چرمی آفتاب", exact: true }).first().click();
  await expect(
    page.getByRole("heading", { name: en.catalog.wholesale.title, exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("table")).toContainText("125,000 toman");
  const privateResponse = await page.request.get("/api/bff/catalog/wholesale/products");
  expect(privateResponse.status()).toBe(200);
  expect(containsPrice(await privateResponse.json())).toBe(true);

  await page.goto("/en/account");
  await page.getByRole("button", { name: en.accounts.account.logout, exact: true }).click();
  await expect(page).toHaveURL(/\/en$/u);
  await page.goto("/en/catalog");
  await expect(page.getByText(en.catalog.priceProtected, { exact: true }).first()).toBeVisible();
  await expect(page.getByText("From 125,000 toman", { exact: true })).toHaveCount(0);
  expect((await page.request.get("/api/bff/catalog/wholesale/products")).status()).toBe(401);
});

test("en: operator claims a submitted product and records a changes-requested decision", async ({
  page,
}) => {
  await page.goto("/en/login");
  await page.getByLabel(en.accounts.register.fields.mobile, { exact: true }).fill("09120000004");
  await page
    .getByLabel(en.accounts.register.fields.password, { exact: true })
    .fill("Operator-e2e-password-2026!");
  await page.getByRole("button", { name: en.accounts.login.submit, exact: true }).click();
  await expect(page).toHaveURL(/\/en\/account$/u, { timeout: 30_000 });

  await page.getByRole("link", { name: en.accounts.account.catalogWorkspace, exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: en.catalogManagement.studioTitle }),
  ).toBeVisible();
  await page.getByRole("link", { name: en.catalogManagement.operatorPanel, exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: en.catalogManagement.operatorTitle }),
  ).toBeVisible();
  await expect(page.getByText("محصول در انتظار بررسی", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: en.catalogManagement.claimAndReview, exact: true })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "محصول در انتظار بررسی" })).toBeVisible();
  await page
    .getByLabel(en.catalogManagement.decision, { exact: true })
    .selectOption("changes_requested");
  await page
    .getByLabel(en.catalogManagement.reasonCode, { exact: true })
    .selectOption("content_incomplete");
  await page
    .getByLabel(en.catalogManagement.reason, { exact: true })
    .fill("Add complete variants, pricing, supply and shipping details.");
  await page
    .getByRole("button", { name: en.catalogManagement.recordDecision, exact: true })
    .click();
  await expect(page).toHaveURL(/\/en\/account\/catalog\/operations$/u);
  await expect(page.getByText("محصول در انتظار بررسی", { exact: true })).toHaveCount(0);
});

import { signOut } from "./helpers/account-navigation";
import { test, expect } from "@playwright/test";
import en from "../messages/en.json" with { type: "json" };
import fa from "../messages/fa.json" with { type: "json" };
import { z } from "zod";
import { publicDiscoverySchema } from "../src/features/catalog/schemas/public-catalog.schema";
import {
  productPageSchema,
  productSchema,
  variantPageSchema,
  revisionPageSchema,
  salesPlanSchema,
  shippingInputSchema,
  servicePageSchema,
  supplySchema,
  categoryPageSchema,
} from "../src/features/catalog/schemas/catalog-management.schema";

test("en: manufacturer editor integrates private source contracts and renders the published product", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const origin = "http://127.0.0.1:8001";
  const credentials = { mobile: "09120000002", password: "Catalog-e2e-password-2026!" };
  const login = await request.post(`${origin}/api/v1/auth/login/`, { data: credentials });
  expect(login.status()).toBe(200);
  const { access } = z.object({ access: z.string() }).parse(await login.json());
  const headers = { Authorization: `Bearer ${access}` };
  const products = await request.get(`${origin}/api/v1/catalog/products/`, { headers });
  const product = productPageSchema
    .parse(await products.json())
    .results.find((row) => row.status === "published");
  if (!product) throw new Error("Published fixture missing");
  const sources: Array<[string, z.ZodType]> = [
    [`catalog/products/${product.id}/`, productSchema],
    [`catalog/products/${product.id}/variants/`, variantPageSchema],
    [`catalog/products/${product.id}/revisions/`, revisionPageSchema],
    [`catalog/products/${product.id}/sales-plan/`, salesPlanSchema],
    [`logistics/products/${product.id}/shipping/`, shippingInputSchema],
    ["logistics/services/", servicePageSchema],
  ];
  for (const [path, schema] of sources) {
    const response = await request.get(`${origin}/api/v1/${path}`, { headers });
    expect(response.status(), path).toBe(200);
    schema.parse(await response.json());
  }
  const variants = variantPageSchema.parse(
    await (
      await request.get(`${origin}/api/v1/catalog/products/${product.id}/variants/`, { headers })
    ).json(),
  );
  for (const variant of variants.results) {
    const response = await request.get(
      `${origin}/api/v1/catalog/products/${product.id}/variants/${variant.id}/supply/`,
      { headers },
    );
    expect(response.status()).toBe(200);
    supplySchema.parse(await response.json());
  }
  await page.goto("/en/login");
  await page
    .getByLabel(en.accounts.register.fields.mobile, { exact: true })
    .fill(credentials.mobile);
  await page
    .getByLabel(en.accounts.register.fields.password, { exact: true })
    .fill(credentials.password);
  await page.getByRole("button", { name: en.accounts.login.submit, exact: true }).click();
  await expect(page).toHaveURL(/\/en\/account$/u, { timeout: 30_000 });
  const editor = await page.request.get(`/api/bff/catalog/studio/editor?id=${product.id}`);
  expect(editor.status(), await editor.text()).toBe(200);
  await page.goto("/en/account/catalog");
  const draftName = page.getByLabel(en.catalogManagement.name, { exact: true });
  await draftName.fill("Unsaved product through session revalidation");
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })),
  );
  await expect(draftName).toBeHidden();
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })),
  );
  await expect(draftName).toBeVisible();
  await expect(draftName).toHaveValue("Unsaved product through session revalidation");
  for (const id of product.images) {
    const image = await page.request.get(`/api/bff/accounts/onboarding/content?id=${id}`);
    expect(image.status(), await image.text()).toBe(200);
    expect(image.headers()["content-type"]).toBe("image/png");
  }
  await page.goto(`/en/account/catalog/${product.id}`);
  await expect(page.getByRole("heading", { level: 1, name: product.name })).toBeVisible({
    timeout: 30_000,
  });
  await page.evaluate(() => document.fonts.ready);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  const { root } = await cdp.send("DOM.getDocument");
  const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: "h1" });
  const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
  expect(fonts.filter((font) => font.glyphCount > 0).map((font) => font.familyName)).toContain(
    "Vazirmatn",
  );
  await cdp.detach();
  await expect(page.getByRole("navigation", { name: en.common.breadcrumb })).toContainText(
    en.accounts.workspace.workspace,
  );
  const prices = page.getByRole("table", {
    name: en.catalogManagement.finalPriceTable,
    exact: true,
  });
  await expect(prices).toContainText("AF-101-BLK-42");
  await expect(prices).toContainText("125,000");
  for (const [locale, messages] of [
    ["en", en],
    ["fa", fa],
  ] as const) {
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
        await page.goto(`/${locale}/account/catalog/${product.id}`);
        const table = page.getByRole("table", {
          name: messages.catalogManagement.finalPriceTable,
          exact: true,
        });
        await expect(table).toContainText(new Intl.NumberFormat(locale).format(125000));
        await table.scrollIntoViewIfNeeded();
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({
          path: `../../handoff/prd-02-completion-2026-10-12/price-table-screenshots/producer__${locale}__${theme}__${viewport}.png`,
          animations: "disabled",
        });
      }
    }
  }
});

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
    await page.getByRole("button", { name: messages.catalog.filters.search, exact: true }).click();
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
  await expect(
    page.getByRole("table", { name: en.catalog.wholesale.caption, exact: true }),
  ).toContainText("125,000 toman");
  const privateResponse = await page.request.get("/api/bff/catalog/wholesale/products");
  expect(privateResponse.status()).toBe(200);
  expect(containsPrice(await privateResponse.json())).toBe(true);

  await page.goto("/en/catalog");
  await expect(page.getByText("From 125,000 toman", { exact: true })).toBeVisible();
  await page.route("**/api/bff/catalog/wholesale/access", (route) => route.abort("failed"));
  // Simulate a visibility refetch failure while an authorized price is already cached.
  await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByText("From 125,000 toman", { exact: true })).toHaveCount(0);
  await expect(page.getByText(en.catalog.priceProtected, { exact: true }).first()).toBeVisible();
  await page.unroute("**/api/bff/catalog/wholesale/access");

  await page.goto("/en/account");
  await signOut(page, en);
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

  await page.getByRole("link", { name: en.accounts.workspace.workspace, exact: true }).click();
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
  await expect(
    page.getByRole("heading", { level: 1, name: "محصول در انتظار بررسی", exact: true }),
  ).toBeVisible();
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

test("fa: guided catalog filters preserve draft, URL history, search and selections", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/fa/catalog?q=کفش&supply=hybrid");
  const trigger = page.getByRole("button", { name: /^فیلترها/u });
  await trigger.click();
  const sheet = page.getByRole("dialog", { name: fa.catalog.filters.title, exact: true });
  await expect(sheet).toBeVisible();
  await expect(page).toHaveURL(/modal=catalog-filters/u);
  await expect(
    sheet.getByRole("checkbox", { name: fa.catalog.supply.hybrid, exact: true }),
  ).toBeChecked();
  await sheet.getByRole("checkbox", { name: fa.catalog.supply.ready, exact: true }).check();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(new URL(page.url()).searchParams.getAll("supply")).toEqual(["hybrid"]);

  await trigger.click();
  await expect(sheet).toBeVisible();
  await expect(
    sheet.getByRole("checkbox", { name: fa.catalog.supply.ready, exact: true }),
  ).not.toBeChecked();
  await page.goBack();
  await expect(sheet).toBeHidden();
  await page.goForward();
  await expect(sheet).toBeVisible();
  await sheet.getByRole("checkbox", { name: fa.catalog.supply.ready, exact: true }).check();
  await sheet.getByRole("button", { name: fa.catalog.filters.apply, exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText("کفش چرمی آفتاب", { exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("q")).toBe("کفش");
  expect(new URL(page.url()).searchParams.getAll("supply").sort()).toEqual(["hybrid", "ready"]);
  expect(new URL(page.url()).searchParams.has("modal")).toBe(false);
  await page.goBack();
  await expect(page).toHaveURL(/supply=hybrid$/u);
  await page.goForward();
  await expect(page).toHaveURL(/supply=ready/u);
  await page.getByLabel(fa.catalog.filters.sort, { exact: true }).selectOption("lead_time");
  await expect(page).toHaveURL(/sort=lead_time/u);
  expect(new URL(page.url()).searchParams.getAll("supply").sort()).toEqual(["hybrid", "ready"]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("en: operator manages definitions and configures a producer proposal before approval", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const t = en.catalogManagement;
  await page.goto("/en/login");
  await page.getByLabel(en.accounts.register.fields.mobile, { exact: true }).fill("09120000004");
  await page
    .getByLabel(en.accounts.register.fields.password, { exact: true })
    .fill("Operator-e2e-password-2026!");
  await page.getByRole("button", { name: en.accounts.login.submit, exact: true }).click();
  await expect(page).toHaveURL(/\/en\/account$/u, { timeout: 30_000 });
  await page.goto("/en/account/catalog/operations");
  const form = page.locator("form").filter({ has: page.getByLabel(t.type, { exact: true }) });
  await form.getByLabel(t.name, { exact: true }).fill("Managed category");
  await form.getByLabel(t.code, { exact: true }).fill("managed-category");
  await form.getByRole("button", { name: t.create, exact: true }).click();
  await expect(page.getByRole("group", { name: "Managed category", exact: true })).toBeVisible();
  await form.getByLabel(t.type, { exact: true }).selectOption("attribute");
  await form
    .getByLabel(t.categoryParent, { exact: true })
    .selectOption({ label: "Managed category" });
  await form.getByLabel(t.name, { exact: true }).fill("Managed color");
  await form.getByLabel(t.code, { exact: true }).fill("managed-color");
  await form.getByLabel(t.attributeKind, { exact: true }).selectOption("choice");
  await form.getByLabel(t.attributeScope, { exact: true }).selectOption("variant");
  await form.getByRole("button", { name: t.create, exact: true }).click();
  await expect(page.getByRole("group", { name: "Managed color", exact: true })).toBeVisible();
  await form.getByLabel(t.type, { exact: true }).selectOption("option");
  await form.getByLabel(t.attribute, { exact: true }).selectOption({ label: "Managed color" });
  await form.getByLabel(t.name, { exact: true }).fill("Managed red");
  await form.getByLabel(t.code, { exact: true }).fill("managed-red");
  await form.getByRole("button", { name: t.create, exact: true }).click();
  const option = page.getByRole("group", { name: "Managed red", exact: true });
  await option.getByRole("button", { name: t.editDefinition, exact: true }).click();
  const edit = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: t.saveDefinition, exact: true }) });
  await edit.getByLabel(t.name, { exact: true }).fill("Managed crimson");
  await edit.getByRole("button", { name: t.saveDefinition, exact: true }).click();
  const updated = page.getByRole("group", { name: "Managed crimson", exact: true });
  await updated.getByLabel(t.statusReason, { exact: true }).fill("Replace this color");
  await updated.getByRole("button", { name: t.deactivate, exact: true }).click();
  await expect(updated.getByRole("button", { name: t.activate, exact: true })).toBeVisible();

  const origin = "http://127.0.0.1:8001/api/v1/";
  const login = await request.post(`${origin}auth/login/`, {
    data: { mobile: "09120000002", password: "Catalog-e2e-password-2026!" },
  });
  expect(login.status()).toBe(200);
  const token = z.object({ access: z.string() }).parse(await login.json());
  const headers = { Authorization: `Bearer ${token.access}` };
  const categories = categoryPageSchema.parse(
    await (await request.get(`${origin}catalog/categories/`, { headers })).json(),
  );
  const category = categories.results.find((item) => item.slug === "managed-category");
  if (!category) throw new Error("Created category missing");
  const products = productPageSchema.parse(
    await (await request.get(`${origin}catalog/products/`, { headers })).json(),
  );
  const product = products.results[0];
  if (!product) throw new Error("Producer fixture missing");
  const proposal = await request.post(`${origin}catalog/proposals/`, {
    headers,
    data: {
      business: product.business,
      kind: "attribute",
      category: category.id,
      attribute: null,
      name: "Managed Weight",
      description: "Weight for dispatch",
      example: "300 g",
    },
  });
  expect(proposal.status()).toBe(201);
  for (const [locale, messages] of [
    ["en", en],
    ["fa", fa],
  ] as const) {
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
        await page.goto(`/${locale}/account/catalog/operations`);
        const proposalForm = page.getByRole("region", {
          name: `${messages.catalogManagement.proposalKinds.attribute}: Managed Weight`,
          exact: true,
        });
        await expect(proposalForm).toBeVisible({ timeout: 30_000 });
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(page.locator("html")).toHaveAttribute("dir", locale === "fa" ? "rtl" : "ltr");
        await page.evaluate(() => document.fonts.ready);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await proposalForm.screenshot({
          path: `../../handoff/prd-02-completion-2026-10-12/taxonomy-screenshots/proposal__${locale}__${theme}__${viewport}.png`,
          caret: "initial",
        });
      }
    }
  }
  await page.goto("/en/account/catalog/operations");
  const section = page.getByRole("region", {
    name: `${t.proposalKinds.attribute}: Managed Weight`,
    exact: true,
  });
  await section
    .getByLabel(t.reason, { exact: true })
    .fill("Use grams for standard variant weights");
  await section.getByLabel(t.code, { exact: true }).fill("managed-weight");
  await page.keyboard.press("Tab");
  await expect(section.getByLabel(t.description, { exact: true })).toBeFocused();
  await section.getByLabel(t.attributeKind, { exact: true }).selectOption("number");
  await section.getByLabel(t.attributeScope, { exact: true }).selectOption("variant");
  await section.getByLabel(t.unit, { exact: true }).fill("g");
  await section.getByRole("button", { name: t.approve, exact: true }).click();
  await expect(section).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Managed Weight", exact: true })).toBeVisible();
  const decisions = await request.get(`${origin}catalog/proposals/`, { headers });
  const result = z
    .object({
      results: z.array(
        z.object({ name: z.string(), status: z.string(), result_id: z.uuid().nullable() }),
      ),
    })
    .parse(await decisions.json());
  expect(result.results.find((row) => row.name === "Managed Weight")).toMatchObject({
    status: "approved",
    result_id: expect.any(String),
  });
});

for (const [locale, messages] of [
  ["en", en],
  ["fa", fa],
] as const) {
  test(`${locale}: managed discovery filters survive empty results and explicit removal`, async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const response = await request.get("http://127.0.0.1:8001/api/v1/catalog/public/discovery/");
    expect(response.status()).toBe(200);
    const discovery = publicDiscoverySchema.parse(await response.json());
    const color = discovery.attributes.find((attribute) => attribute.code === "color");
    if (!color) throw new Error("Managed color fixture missing");
    await page.goto(`/${locale}/catalog?q=کفش`);
    const mobile = locale === "fa";
    if (mobile)
      await page
        .getByRole("button", { name: new RegExp(`^${messages.catalog.filters.title}`) })
        .click();
    const form = page.locator(mobile ? "#catalog-mobile-filters" : "#catalog-desktop-filters");
    await form.getByRole("checkbox", { name: "کفش / کفش روزمره", exact: true }).check();
    await form.getByRole("checkbox", { name: "چرم آفتاب", exact: true }).check();
    await form.getByRole("checkbox", { name: "قهوه‌ای", exact: true }).check();
    if (mobile)
      await page
        .getByRole("dialog")
        .getByRole("button", { name: messages.catalog.filters.apply, exact: true })
        .click();
    else
      await form.getByRole("button", { name: messages.catalog.filters.apply, exact: true }).click();
    await expect(page.getByText(messages.catalog.empty.title, { exact: true })).toBeVisible();
    expect(new URL(page.url()).searchParams.get(`attr.${color.id}`)).toBe("brown");
    const filteredUrl = page.url();
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
        await page.goto(filteredUrl);
        if (viewport === "mobile")
          await page
            .getByRole("button", { name: new RegExp(`^${messages.catalog.filters.title}`) })
            .click();
        const filters = page.locator(
          viewport === "mobile" ? "#catalog-mobile-filters" : "#catalog-desktop-filters",
        );
        await expect(filters.getByRole("checkbox", { name: "قهوه‌ای", exact: true })).toBeChecked();
        await expect(
          filters.getByRole("checkbox", { name: "کفش / کفش روزمره", exact: true }),
        ).toBeChecked();
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(page.locator("html")).toHaveAttribute("dir", locale === "fa" ? "rtl" : "ltr");
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await page.evaluate(() => document.fonts.ready);
        const folder = "../../handoff/prd-02-completion-2026-10-12/discovery-screenshots";
        if (viewport === "desktop")
          await filters.screenshot({
            path: `${folder}/filters__${locale}__${theme}__${viewport}.png`,
            caret: "initial",
          });
        else {
          for (const [position, control] of [
            ["top", filters.getByRole("checkbox", { name: "کفش", exact: true })],
            ["middle", filters.getByLabel(messages.catalog.filters.ratingMin, { exact: true })],
            ["bottom", filters.getByLabel(messages.catalog.filters.leadMax, { exact: true })],
          ] as const) {
            await control.scrollIntoViewIfNeeded();
            await page.screenshot({
              path: `${folder}/filters__${locale}__${theme}__mobile__${position}.png`,
              caret: "initial",
            });
          }
        }
      }
    }
    await page.goto(filteredUrl);
    const remove = messages.catalog.filters.remove.replace("{filter}", "رنگ: قهوه‌ای");
    await page.getByRole("link", { name: remove, exact: true }).click();
    await expect(page.getByText("کفش چرمی آفتاب", { exact: true })).toBeVisible();
    const query = new URL(page.url()).searchParams;
    expect(query.has(`attr.${color.id}`)).toBe(false);
    expect(query.has("manufacturer")).toBe(true);
    expect(query.has("category")).toBe(true);
    expect(query.get("q")).toBe("کفش");
  });
}

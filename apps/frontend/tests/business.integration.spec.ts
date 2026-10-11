import { signOut } from "./helpers/account-navigation";
import { randomBytes, randomInt } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { businessSchema } from "../src/features/accounts/schemas/business.schema";
import en from "../messages/en.json" with { type: "json" };
import fa from "../messages/fa.json" with { type: "json" };

for (const [locale, copy] of [
  ["en", en],
  ["fa", fa],
] as const) {
  test(`${locale}: real business creation, uncertain response, ownership and logout`, async ({
    page,
    context,
    request,
    browser,
  }) => {
    const t = copy.accounts.business;
    const password = randomBytes(32).toString("base64url");
    const mobile = () => `09${String(randomInt(1_000_000_000)).padStart(9, "0")}`;
    const owner = mobile(),
      other = mobile();
    async function register(number: string) {
      expect(
        (
          await request.post("/api/bff/auth/register", {
            headers: { Origin: "http://localhost:3100" },
            data: {
              first_name: "Business",
              last_name: "Owner",
              mobile: number,
              password,
              accept_terms: true,
            },
          })
        ).status(),
      ).toBe(201);
    }
    async function login(target: Page, number: string) {
      await target.goto(`/${locale}/login`);
      await target.getByLabel(copy.accounts.register.fields.mobile, { exact: true }).fill(number);
      await target
        .getByLabel(copy.accounts.register.fields.password, { exact: true })
        .fill(password);
      await target.getByRole("button", { name: copy.accounts.login.submit, exact: true }).click();
      await expect(target).toHaveURL(new RegExp(`/${locale}/account$`));
      await target
        .getByRole("link", { name: copy.accounts.workspace.business, exact: true })
        .first()
        .click();
    }
    expect((await request.get("/api/bff/accounts/business")).status()).toBe(401);
    await register(owner);
    await login(page, owner);
    await page.getByRole("button", { name: t.create, exact: true }).click();
    await expect(page.getByText(t.invalid, { exact: true }).first()).toBeVisible();
    const profile = {
      name: `${locale} Private Business`,
      kind: locale === "fa" ? "manufacturer" : "retailer",
      phone: "02112345678",
      description: "Private workshop activity",
      address: { province: "Tehran", city: "Tehran", address: "Private business address 42" },
    };
    await page.getByLabel(t.fields.kind, { exact: true }).selectOption(profile.kind);
    for (const [label, value] of [
      [t.fields.name, profile.name],
      [t.fields.phone, "۰۲۱۱۲۳۴۵۶۷۸"],
      [t.fields.description, profile.description],
      [t.fields.address.province, profile.address.province],
      [t.fields.address.city, profile.address.city],
      [t.fields.address.address, profile.address.address],
    ])
      await page.getByLabel(label!, { exact: true }).fill(value!);
    let writes = 0;
    await page.route("**/api/bff/accounts/business", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      writes++;
      if (locale === "en") {
        const response = await route.fetch();
        expect(response.status()).toBe(201);
        return route.abort(); // Committed create, lost response: only an explicit GET may recover.
      }
      return route.continue();
    });
    await page.getByRole("button", { name: t.create, exact: true }).click();
    if (locale === "en") {
      await expect(page.getByText(t.uncertain)).toBeVisible();
      await page.getByRole("button", { name: t.check, exact: true }).click();
    }
    await expect(page.getByText(profile.name, { exact: true })).toBeVisible();
    expect(writes).toBe(1);
    await page.unroute("**/api/bff/accounts/business");
    const saved = businessSchema.parse(
      await (await context.request.get("/api/bff/accounts/business")).json(),
    );
    expect(saved).toMatchObject({
      name: profile.name,
      kind: profile.kind,
      status: "draft",
      controlled_access: false,
      phone: profile.phone,
    });
    expect(saved.addresses[0]).toMatchObject(profile.address);
    expect(
      (
        await context.request.post("/api/bff/accounts/business", {
          headers: { Origin: "http://localhost:3100" },
          data: {
            ...profile,
            kind: profile.kind === "manufacturer" ? "retailer" : "manufacturer",
            owner: other,
            status: "verified",
            controlled_access: true,
          },
        })
      ).status(),
    ).toBe(409);
    await page.reload();
    await expect(page.getByText(profile.name, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: t.create, exact: true })).toHaveCount(0);
    await expect(page.getByText(t.draftNotice)).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    await register(other);
    const otherContext = await browser.newContext({ baseURL: "http://localhost:3100" });
    try {
      const otherPage = await otherContext.newPage();
      await login(otherPage, other);
      await expect(otherPage.getByRole("button", { name: t.create, exact: true })).toBeVisible();
      expect(
        await (
          await otherContext.request.get(`/api/bff/accounts/business?business=${saved.id}`)
        ).json(),
      ).toBeNull();
      await expect(otherPage.getByText(profile.name, { exact: true })).toHaveCount(0);
    } finally {
      await otherContext.close();
    }
    await signOut(page, copy);
    await expect(page).toHaveURL(new RegExp(`/${locale}$`));
    await page.goBack();
    await expect(page.getByText(profile.name, { exact: true })).toHaveCount(0);
    expect((await context.request.get("/api/bff/accounts/business")).status()).toBe(401);
  });
}

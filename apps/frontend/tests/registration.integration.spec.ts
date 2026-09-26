import { randomInt, randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { z } from "zod";
import en from "../messages/en.json" with { type: "json" };
import fa from "../messages/fa.json" with { type: "json" };

for (const [locale, messages] of [
  ["en", en],
  ["fa", fa],
] as const) {
  test(`${locale}: real registration, duplicate rejection and no automatic session/business`, async ({
    page,
    request,
    context,
  }) => {
    const copy = messages.accounts.register;
    const mobile = `09${String(randomInt(1_000_000_000)).padStart(9, "0")}`;
    const password = `Test-${randomUUID()}!`;
    await page.goto(`/${locale}/register`);
    const fill = async () => {
      await page.getByLabel(copy.fields.first_name, { exact: true }).fill("Frontend");
      await page.getByLabel(copy.fields.last_name, { exact: true }).fill("Test");
      await page.getByLabel(copy.fields.mobile, { exact: true }).fill(mobile);
      await page.getByLabel(copy.fields.password, { exact: true }).fill(password);
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: copy.submit, exact: true }).click();
    };
    await fill();
    await expect(page.getByText(copy.successTitle)).toBeVisible();
    expect(
      (await context.cookies()).some((cookie) =>
        ["ds.session", "__Secure-ds.session"].includes(cookie.name),
      ),
    ).toBe(false);
    expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);

    // Server-side API calls prove the created credentials work; tokens never enter page JS.
    const login = await request.post("http://127.0.0.1:8001/api/v1/auth/login/", {
      data: { mobile, password },
    });
    expect(login.status()).toBe(200);
    const pair = z.object({ access: z.string(), refresh: z.string() }).parse(await login.json());
    const businesses = await request.get("http://127.0.0.1:8001/api/v1/businesses/", {
      headers: { Authorization: `Bearer ${pair.access}` },
    });
    expect(businesses.status()).toBe(200);
    expect(z.object({ count: z.number() }).parse(await businesses.json()).count).toBe(0);
    await request.post("http://127.0.0.1:8001/api/v1/auth/logout/", {
      headers: { Authorization: `Bearer ${pair.access}` },
      data: {},
    });

    await page.reload();
    await fill();
    await expect(page.getByText(copy.errors.rejected)).toBeVisible();
    await expect(page.getByLabel(copy.fields.password, { exact: true })).toBeVisible();
  });
}

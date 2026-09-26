import { randomInt, randomUUID, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { test, expect } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";
import { decode } from "next-auth/jwt";
import { Pool } from "pg";
import en from "../messages/en.json" with { type: "json" };
import fa from "../messages/fa.json" with { type: "json" };

async function register(request: APIRequestContext) {
  const mobile = `09${String(randomInt(1_000_000_000)).padStart(9, "0")}`;
  const password = `Test-${randomUUID()}!`;
  const name = `PrivatePerson${randomInt(100_000_000)}`;
  const response = await request.post("/api/bff/auth/register", {
    headers: { Origin: "http://localhost:3100" },
    data: { mobile, password, first_name: name, last_name: "Test", email: "", accept_terms: true },
  });
  expect(response.status()).toBe(201);
  return { mobile, password, name };
}
async function login(
  page: Page,
  locale: string,
  copy: typeof en,
  credentials: Awaited<ReturnType<typeof register>>,
) {
  await page.goto(`/${locale}/login`);
  await page
    .getByLabel(copy.accounts.register.fields.mobile, { exact: true })
    .fill(credentials.mobile);
  await page
    .getByLabel(copy.accounts.register.fields.password, { exact: true })
    .fill(credentials.password);
  await page.getByRole("button", { name: copy.accounts.login.submit, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/account$`));
  await expect(page.getByText(credentials.name, { exact: false })).toBeVisible();
}
for (const [locale, copy] of [
  ["en", en],
  ["fa", fa],
] as const) {
  test(`${locale}: real session, logout, history, direct access and another tab`, async ({
    page,
    request,
    context,
  }) => {
    await page.addInitScript(() => {
      window.addEventListener("pageshow", (event) => {
        document.documentElement.dataset.bfcache = String(event.persisted);
      });
    });
    await page.goto(`/${locale}/account`);
    await expect(page).toHaveURL(new RegExp(`/${locale}/login$`));
    const credentials = await register(request);
    await request.post("/api/auth/callback/credentials", {
      headers: { Origin: "http://localhost:3100" },
      form: {
        mobile: credentials.mobile,
        password: credentials.password,
        csrfToken: "forged",
        callbackUrl: `/${locale}/account`,
        json: "true",
      },
    });
    expect((await request.get("/api/bff/auth/session")).status()).toBe(401);
    await login(page, locale, copy, credentials);
    const cookie = (await context.cookies()).find((entry) => entry.name === "ds.session");
    expect(!!cookie && cookie.httpOnly && cookie.sameSite === "Lax").toBe(true);
    const cookieHeader = `ds.session=${cookie!.value}`;
    expect((await page.content()).includes(credentials.password)).toBe(false);
    expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
    const html = await request.get(`/${locale}/account`, { headers: { Cookie: cookieHeader } });
    expect((await html.text()).includes(credentials.name)).toBe(false);
    await page.goto(`/${locale}`);
    await page.goBack();
    // Target browser runs exclude this private no-store document from BFCache.
    // Exercise the restore lifecycle explicitly below without weakening production headers.
    await expect(page.locator("html")).toHaveAttribute("data-bfcache", "false");
    await expect(page.getByText(credentials.name, { exact: false })).toBeVisible();
    await page.reload();
    await expect(page.getByText(credentials.name, { exact: false })).toBeVisible();
    await page.evaluate(() =>
      window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })),
    );
    await expect(page.getByText(credentials.name, { exact: false })).not.toBeVisible();
    await page.evaluate(() =>
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })),
    );
    await expect(page.getByText(credentials.name, { exact: false })).toBeVisible();
    await page.getByRole("link", { name: copy.common.backHome, exact: true }).click();
    await page.getByRole("link", { name: copy.nav.account, exact: true }).hover();
    await page.getByRole("link", { name: copy.nav.account, exact: true }).click();
    await expect(page.getByText(credentials.name, { exact: false })).toBeVisible();
    const other = await context.newPage();
    await other.goto(`/${locale}/account`);
    await expect(other.getByText(credentials.name, { exact: false })).toBeVisible();
    await page.bringToFront();
    await page.getByRole("button", { name: copy.accounts.account.logout, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${locale}$`));
    await expect(other).toHaveURL(new RegExp(`/${locale}$`));
    await expect(page.getByText(credentials.name, { exact: false })).toHaveCount(0);
    await page.goBack();
    await expect(page.getByText(credentials.name, { exact: false })).not.toBeVisible();
    await page.goto(`/${locale}/account`);
    await expect(page).toHaveURL(new RegExp(`/${locale}/login$`));
    await page.reload();
    await expect(page.getByText(credentials.name, { exact: false })).toHaveCount(0);
    expect(
      (await request.get("/api/bff/auth/session", { headers: { Cookie: cookieHeader } })).status(),
    ).toBe(401);
    expect(
      (
        await request.post("/api/bff/auth/logout", {
          headers: { Origin: "https://foreign.example", Cookie: cookieHeader },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await request.post("/api/auth/signout", { headers: { Origin: "http://localhost:3100" } })
      ).status(),
    ).toBe(405);
    await other.close();
    await page.goForward();
    await expect(page.getByText(credentials.name, { exact: false })).not.toBeVisible();

    // A late successful private response must not restore the account after logout.
    await login(page, locale, copy, credentials);
    let release!: () => void;
    let arrived!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const received = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    await page.route("**/api/bff/auth/session", async (route) => {
      const response = await route.fetch();
      arrived();
      await held;
      await route.fulfill({ response }).catch(() => {});
    });
    await page.reload();
    await received;
    await page.getByRole("button", { name: copy.accounts.account.logout, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${locale}$`));
    release();
    await page.unrouteAll({ behavior: "wait" });
    await expect(page.getByText(credentials.name, { exact: false })).toHaveCount(0);
    if (locale === "en") {
      const nextPerson = await register(request);
      await login(page, locale, copy, nextPerson);
      await expect(page.getByText(credentials.name, { exact: false })).toHaveCount(0);
      await page.getByRole("button", { name: copy.accounts.account.logout, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}$`));
    }
  });
}

test("two independent frontend processes serialize refresh and fail closed on uncertain state", async ({
  page,
  request,
  context,
}) => {
  const credentials = await register(request);
  await login(page, "en", en, credentials);
  const cookie = (await context.cookies()).find((entry) => entry.name === "ds.session")!;
  const token = await decode({ token: cookie.value, secret: process.env.NEXTAUTH_SECRET! });
  const id = token!.sub!;
  const pool = new Pool({ connectionString: process.env.FRONTEND_DATABASE_URL });
  const key = Buffer.from(process.env.SESSION_VAULT_KEY!, "hex");
  try {
    await page.goto("/en");
    const result = await pool.query<{ encrypted_tokens: string }>(
      "SELECT encrypted_tokens FROM web_auth_session WHERE id=$1",
      [id],
    );
    const bytes = Buffer.from(result.rows[0]!.encrypted_tokens, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(id));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const pair: { access: string; refresh: string } = JSON.parse(
      Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8"),
    );
    // Only the local expiry hint is changed. Refresh still uses the real Django-issued token.
    const parts = pair.access.split(".");
    parts[1] = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")),
        exp: 1,
      }),
    ).toString("base64url");
    pair.access = parts.join(".");
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, nonce);
    cipher.setAAD(Buffer.from(id));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(pair), "utf8"), cipher.final()]);
    await pool.query("UPDATE web_auth_session SET encrypted_tokens=$2 WHERE id=$1", [
      id,
      Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString("base64url"),
    ]);
    const headers = { Cookie: `ds.session=${cookie.value}` };
    const responses = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        request.get(`http://${i % 2 ? "127.0.0.1:3101" : "localhost:3100"}/api/bff/auth/session`, {
          headers,
        }),
      ),
    );
    expect(responses.map((response) => response.status())).toEqual([200, 200, 200, 200, 200, 200]);
    const state = await pool.query<{ state: string }>(
      "SELECT state FROM web_auth_session WHERE id=$1",
      [id],
    );
    expect(state.rows[0]!.state).toBe("ready");
    await pool.query("UPDATE web_auth_session SET state='refreshing' WHERE id=$1", [id]);
    for (const host of ["localhost:3100", "127.0.0.1:3101"])
      expect((await request.get(`http://${host}/api/bff/auth/session`, { headers })).status()).toBe(
        401,
      );
    expect(
      (
        await request.post("/api/bff/auth/logout", {
          headers: { ...headers, Origin: "http://localhost:3100" },
        })
      ).status(),
    ).toBe(503);
    expect((await request.get("/api/bff/auth/session", { headers })).status()).toBe(401);

    // Authoritative expiry and suspension from Django, with an otherwise valid web cookie.
    await login(page, "en", en, credentials);
    const normalizedMobile = `+98${credentials.mobile.slice(1)}`;
    await pool.query(
      "UPDATE accounts_authsession SET expires_at=now()-interval '1 second' WHERE user_id=(SELECT id FROM accounts_user WHERE mobile=$1)",
      [normalizedMobile],
    );
    await page.reload();
    await expect(page).toHaveURL(/\/en\/login$/);
    await expect(page.getByText(credentials.name, { exact: false })).toHaveCount(0);
    await login(page, "en", en, credentials);
    await pool.query("UPDATE accounts_user SET is_suspended=true WHERE mobile=$1", [
      normalizedMobile,
    ]);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page).toHaveURL(/\/en\/login$/);
    await expect(page.getByText(credentials.name, { exact: false })).toHaveCount(0);
  } finally {
    await pool.end();
  }
});

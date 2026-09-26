import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, randomInt } from "node:crypto";
import { test, expect } from "@playwright/test";
import { z } from "zod";
import en from "../messages/en.json" with { type: "json" };
import fa from "../messages/fa.json" with { type: "json" };
const locale = process.env.RECOVERY_LOCALE === "en" ? "en" : "fa";
const copy = locale === "en" ? en : fa;
function mailbox() {
  return z
    .array(z.object({ body: z.string(), to: z.array(z.string()) }))
    .parse(
      JSON.parse(
        readFileSync(join(tmpdir(), process.env.E2E_DATABASE_NAME!, "outbox.json"), "utf8"),
      ),
    );
}
function latestLink() {
  return new URL(mailbox().at(-1)!.body.trim().split("\n").at(-1)!);
}

test(`${locale}: real email verification, link rotation and password recovery revoke old sessions`, async ({
  page,
  request,
  context,
}) => {
  test.setTimeout(60_000);
  const r = copy.accounts.recovery;
  const mobile = `09${String(randomInt(1_000_000_000)).padStart(9, "0")}`;
  const password = randomBytes(32).toString("base64url");
  const nextPassword = randomBytes(32).toString("base64url");
  const email = `account${randomInt(100_000_000)}@example.test`;
  const registration = await request.post("/api/bff/auth/register", {
    headers: { Origin: "http://localhost:3100" },
    data: {
      first_name: "Recovery",
      last_name: "Person",
      mobile,
      password,
      email: "",
      accept_terms: true,
    },
  });
  expect(registration.status()).toBe(201);
  await page.goto(`/${locale}/login`);
  await page.getByLabel(copy.accounts.register.fields.mobile, { exact: true }).fill(mobile);
  await page.getByLabel(copy.accounts.register.fields.password, { exact: true }).fill(password);
  await page.getByRole("button", { name: copy.accounts.login.submit, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/account$`));
  const oldCookie = (await context.cookies()).find((entry) => entry.name === "ds.session")!;
  await page.getByLabel(r.email, { exact: true }).fill(email);
  await page.getByLabel(r.current_password).fill("wrong-password");
  await page.getByRole("button", { name: r.saveEmail }).click();
  await expect(page.getByText(r.requestError)).toBeVisible();
  await page.getByLabel(r.current_password).fill(password);
  await page.getByRole("button", { name: r.saveEmail }).click();
  await expect(page.getByText(r.emailSaved)).toBeVisible();
  await expect.poll(() => mailbox().length).toBe(1);
  const replacedLink = latestLink();
  expect(replacedLink.search === "").toBe(true);

  const recovery = await context.newPage();
  await recovery.goto(`/${locale}/forgot-password`);
  await recovery.getByLabel(r.email, { exact: true }).fill(email);
  await recovery.getByRole("button", { name: r.requestReset }).click();
  await expect(recovery.getByText(r.resetRequested)).toBeVisible();
  expect(mailbox().length).toBe(1); // Unverified email cannot recover an account.

  await page.bringToFront();
  await page.getByRole("button", { name: r.resend }).click();
  await expect(page.getByText(r.verificationRequested)).toBeVisible();
  await expect.poll(() => mailbox().length).toBe(2);
  const validLink = latestLink();
  const open = async (link: URL) => {
    link.pathname = `/${locale}/account/confirm`;
    await recovery.goto(link.href).catch(() => {
      throw new Error("Email link navigation failed");
    });
    await expect
      .poll(() =>
        recovery
          .getByRole("button", {
            name:
              new URLSearchParams(link.hash.slice(1)).get("purpose") === "reset"
                ? r.savePassword
                : r.confirmEmail,
            exact: true,
          })
          .isVisible(),
      )
      .toBe(true);
  };
  await open(replacedLink);
  await recovery.getByRole("button", { name: r.confirmEmail, exact: true }).click();
  await expect(recovery.getByText(r.consumeError)).toBeVisible();
  await open(validLink);
  await expect(recovery.getByRole("button", { name: r.confirmEmail, exact: true })).toBeVisible();
  const before = await context.request.get("/api/bff/auth/session");
  expect(
    z.object({ email_verified_at: z.string().nullable() }).parse(await before.json())
      .email_verified_at,
  ).toBeNull();
  expect((await recovery.content()).includes(validLink.hash.slice(1))).toBe(false);
  await recovery.reload(); // Reload does not consume a fragment link.
  await recovery.getByRole("button", { name: r.confirmEmail, exact: true }).click();
  await expect(recovery.getByText(r.verifyDone)).toBeVisible();
  await page.bringToFront();
  // Headless tabs may stay visible; allow the normal session polling interval.
  await expect(page.getByText(copy.accounts.account.emailVerified)).toBeVisible({
    timeout: 20_000,
  });

  await recovery.goto(`/${locale}/forgot-password`);
  await recovery.getByLabel(r.email, { exact: true }).fill(email);
  await recovery.getByRole("button", { name: r.requestReset }).click();
  await expect(recovery.getByText(r.resetRequested)).toBeVisible();
  await expect.poll(() => mailbox().length).toBe(3);
  await open(latestLink());
  await recovery.getByLabel(r.newPassword).fill(nextPassword);
  await recovery.getByRole("button", { name: r.savePassword }).click();
  await expect(recovery.getByText(r.resetDone)).toBeVisible();
  expect(
    (
      await request.get("/api/bff/auth/session", {
        headers: { Cookie: `ds.session=${oldCookie.value}` },
      })
    ).status(),
  ).toBe(401);
  await expect(page).toHaveURL(new RegExp(`/${locale}$`));
  expect(await recovery.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  await recovery.getByRole("link", { name: r.login, exact: true }).click();
  await recovery.getByLabel(copy.accounts.register.fields.mobile, { exact: true }).fill(mobile);
  await recovery.getByLabel(copy.accounts.register.fields.password, { exact: true }).fill(password);
  await recovery.getByRole("button", { name: copy.accounts.login.submit, exact: true }).click();
  await expect(recovery.getByText(copy.accounts.login.error)).toBeVisible();
  await recovery
    .getByLabel(copy.accounts.register.fields.password, { exact: true })
    .fill(nextPassword);
  await recovery.getByRole("button", { name: copy.accounts.login.submit, exact: true }).click();
  await expect(recovery).toHaveURL(new RegExp(`/${locale}/account$`));
  await expect(recovery.getByText(copy.accounts.account.emailVerified)).toBeVisible();
  await recovery.close();
});

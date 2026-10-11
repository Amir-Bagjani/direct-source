import { writeFile } from "node:fs/promises";
import { randomInt, randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import en from "../messages/en.json" with { type: "json" };
const origin = { Origin: "http://localhost:3100" };
test("real 15s polling preserves account form, scroll and focus; network retry and cache clearing preserve draft", async ({
  page,
  request,
  context,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 390, height: 600 });
  const mobile = `09${String(randomInt(1000000000)).padStart(9, "0")}`,
    password = `Test-${randomUUID()}!`;
  expect(
    (
      await request.post("/api/bff/auth/register", {
        headers: origin,
        data: {
          mobile,
          password,
          first_name: "Regression",
          last_name: "Account",
          accept_terms: true,
        },
      })
    ).status(),
  ).toBe(201);
  await page.goto("/en/login");
  await page.getByLabel(en.accounts.register.fields.mobile, { exact: true }).fill(mobile);
  await page.getByLabel(en.accounts.register.fields.password, { exact: true }).fill(password);
  await page.getByRole("button", { name: en.accounts.login.submit, exact: true }).click();
  await expect(page).toHaveURL(/\/en\/account$/);
  await page.goto("/en/account/business");
  const field = page.getByLabel(en.accounts.business.fields.address.address, { exact: true });
  await field.fill("Unsaved address survives natural polling");
  await field.focus();
  const before = await page.evaluate(() => ({
    scroll: scrollY,
    height: document.documentElement.scrollHeight,
  }));
  expect(before.scroll).toBeGreaterThan(0);
  if (process.env.ACCOUNT_VISUAL_QA_DIR)
    await page.screenshot({
      path: `${process.env.ACCOUNT_VISUAL_QA_DIR}/polling-before-en-mobile.png`,
      animations: "disabled",
    });
  let reads = 0;
  page.on("response", (r) => {
    if (r.url().endsWith("/api/bff/auth/session")) reads++;
  });
  await expect.poll(() => reads, { timeout: 23000 }).toBeGreaterThan(0);
  await expect(field).toBeVisible();
  await expect(field).toHaveValue("Unsaved address survives natural polling");
  await expect(field).toBeFocused();
  const after = await page.evaluate(() => ({
    scroll: scrollY,
    height: document.documentElement.scrollHeight,
  }));
  expect(after).toEqual(before);
  if (process.env.ACCOUNT_VISUAL_QA_DIR) {
    await page.screenshot({
      path: `${process.env.ACCOUNT_VISUAL_QA_DIR}/polling-after-en-mobile.png`,
      animations: "disabled",
    });
    await writeFile(
      `${process.env.ACCOUNT_VISUAL_QA_DIR}/../evidence/polling.json`,
      JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          before,
          after,
          reads,
          browser: "Chrome",
          state: "real unsaved business form; natural session polling",
        },
        null,
        2,
      ),
    );
  }
  let failed = false;
  await page.route("**/api/bff/auth/session", async (route) => {
    if (!failed) {
      failed = true;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ code: "unavailable", request_id: "fault-injection" }),
      });
    } else await route.continue();
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText(en.accounts.account.unavailable, { exact: true })).toBeVisible();
  await expect(field).not.toBeVisible();
  if (process.env.ACCOUNT_VISUAL_QA_DIR)
    await page.screenshot({
      path: `${process.env.ACCOUNT_VISUAL_QA_DIR}/session-network-error-en-mobile.png`,
      animations: "disabled",
    });
  await page.getByRole("button", { name: en.common.retry, exact: true }).click();
  await expect(field).toBeVisible();
  await expect(field).toHaveValue("Unsaved address survives natural polling");
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })),
  );
  await expect(field).not.toBeVisible();
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })),
  );
  await expect(field).toBeVisible();
  await expect(field).toHaveValue("Unsaved address survives natural polling");
  await page.unroute("**/api/bff/auth/session");
  expect(
    (
      await context.request.post("/api/bff/accounts/business", {
        headers: origin,
        data: {
          name: "Wizard regression",
          kind: "manufacturer",
          phone: "02112345678",
          description: "Test workshop",
          address: { province: "Tehran", city: "Tehran", address: "Private test street" },
        },
      })
    ).status(),
  ).toBe(201);
  await page.goto("/en/account/business/verification?keep=yes&step=identity");
  const identity = page.getByLabel(en.accounts.onboarding.nationalId, { exact: true });
  await identity.fill("0123456789");
  await page.getByRole("button", { name: en.accounts.workspace.activityStep, exact: true }).click();
  await expect(page).toHaveURL(/keep=yes&step=activity/);
  await page.goBack();
  await expect(identity).toBeVisible();
  await expect(identity).toHaveValue("0123456789");
  await page.goForward();
  await expect(page.getByLabel(en.accounts.onboarding.evidenceType, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: en.accounts.workspace.identityStep, exact: true }).click();
  const upload = page.getByLabel(en.accounts.onboarding.cardFront, { exact: true });
  await upload.setInputFiles({
    name: "bad.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Invalid evidence"),
  });
  await expect(upload).toHaveAttribute("aria-invalid", "true");
  let queueReads = 0;
  page.on("request", (r) => {
    if (r.url().includes("onboarding/queue")) queueReads++;
  });
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/en/account/operations/businesses");
  await expect(page.getByText(en.accounts.workspace.permission, { exact: true })).toBeVisible();
  expect(queueReads).toBe(0);
});

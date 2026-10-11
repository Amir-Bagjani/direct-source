import { signOut } from "./helpers/account-navigation";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { test, expect, type Page } from "@playwright/test";
import en from "../messages/en.json" with { type: "json" };
import fa from "../messages/fa.json" with { type: "json" };
const locale = process.env.ONBOARDING_LOCALE === "en" ? "en" : "fa";
const copy = locale === "fa" ? fa : en;
const t = copy.accounts.onboarding;
const origin = { Origin: "http://localhost:3100" };
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGNkYPjPgA0wYRUdtBIAy0MBD1YkjLoAAAAASUVORK5CYII=",
  "base64",
);
test(`${locale}: draft/logo, real scanned documents, correction, rejection, reopening and verification`, async ({
  page,
  context,
  request,
  browser,
}) => {
  const password = randomBytes(32).toString("base64url");
  const numbers = Array.from(
    { length: 3 },
    () => `09${String(randomInt(1_000_000_000)).padStart(9, "0")}`,
  );
  for (const mobile of numbers)
    expect(
      (
        await request.post("/api/bff/auth/register", {
          headers: origin,
          data: {
            first_name: "Test",
            last_name: "Onboarding",
            mobile,
            password,
            accept_terms: true,
          },
        })
      ).status(),
    ).toBe(201);
  const pool = new Pool({ connectionString: process.env.FRONTEND_DATABASE_URL });
  const reviewer = await browser.newContext({ baseURL: "http://localhost:3100" });
  const outsider = await browser.newContext({ baseURL: "http://localhost:3100" });
  async function login(target: Page, mobile: string) {
    await target.bringToFront();
    await target.goto(`/${locale}/login`);
    await target.getByLabel(copy.accounts.register.fields.mobile, { exact: true }).fill(mobile);
    await target.getByLabel(copy.accounts.register.fields.password, { exact: true }).fill(password);
    await target.getByRole("button", { name: copy.accounts.login.submit, exact: true }).click();
    await expect(target).toHaveURL(new RegExp(`/${locale}/account$`));
  }
  async function capture(target: Page, state: string) {
    if (!process.env.ACCOUNT_VISUAL_QA_DIR) return;
    await target.bringToFront();
    await expect(target.locator("main h1")).toBeVisible();
    await target.waitForLoadState("networkidle");
    await target.evaluate(() => document.fonts.ready);
    await target.screenshot({
      path: `${process.env.ACCOUNT_VISUAL_QA_DIR}/onboarding-${state}-${locale}.png`,
      fullPage: true,
    });
  }
  async function upload(target: Page, label: string, number = 1) {
    await target.bringToFront();
    const input = target.getByLabel(label, { exact: true });
    const field = target.getByText(label, { exact: true }).locator("..");
    await input.setInputFiles({ name: "evidence.png", mimeType: "image/png", buffer: png });
    const checkbox = field.getByRole("checkbox");
    if (!(await checkbox.isChecked())) await checkbox.check();
    await field.getByRole("button", { name: t.upload, exact: true }).click();
    await expect(
      field.getByRole("link", {
        name: t.viewFile.replace("{number}", String(number)),
        exact: true,
      }),
    ).toBeVisible();
  }
  try {
    await pool.query(
      "INSERT INTO accounts_platformrole (id,created_at,updated_at,user_id,role,is_active) SELECT $1,now(),now(),id,'operator',true FROM accounts_user WHERE mobile=$2",
      [randomUUID(), `+98${numbers[1]!.slice(1)}`],
    );
    await login(page, numbers[0]!);
    const profile = {
      name: "Private workshop",
      kind: "manufacturer",
      phone: "02112345678",
      description: "Private activity",
      address: { province: "Tehran", city: "Tehran", address: "Private street" },
    };
    expect(
      (
        await context.request.post("/api/bff/accounts/business", { headers: origin, data: profile })
      ).status(),
    ).toBe(201);
    await page
      .getByRole("link", { name: copy.accounts.workspace.business, exact: true })
      .first()
      .click();
    await page.getByRole("button", { name: t.editProfile, exact: true }).click();
    await page
      .getByLabel(copy.accounts.business.fields.name, { exact: true })
      .fill("Edited workshop");
    await upload(page, copy.accounts.business.logo);
    await page.getByRole("button", { name: copy.accounts.business.save, exact: true }).click();
    await expect(page.getByText("Edited workshop", { exact: true })).toBeVisible();
    await expect(page.getByRole("img", { name: t.logo })).toBeVisible();
    const business = await (await context.request.get("/api/bff/accounts/business")).json();
    const endpoint = (action: string) => `/api/bff/accounts/onboarding/${action}?id=${business.id}`;
    expect((await context.request.post(endpoint("submit"), { headers: origin })).status()).toBe(
      400,
    );
    await page
      .getByRole("link", { name: copy.accounts.workspace.verification, exact: true })
      .first()
      .click();
    await page.getByLabel(t.nationalId, { exact: true }).fill("۰۱۲۳۴۵۶۷۸۹");
    await page.getByLabel(t.birthDate, { exact: true }).fill("1370/01/01");
    await upload(page, t.cardFront);
    await upload(page, t.cardBack);
    await upload(page, t.selfie);
    await capture(page, "identity-ready");
    const identity = page.getByRole("group", { name: t.identity, exact: true });
    await identity
      .getByRole("button", { name: copy.accounts.workspace.saveContinue, exact: true })
      .click();
    await expect(page.getByLabel(t.evidenceType, { exact: true })).toBeVisible();
    await page.getByLabel(t.evidenceType, { exact: true }).selectOption("alternative");
    await upload(page, t.activityFiles);
    await upload(page, t.activityFiles, 2);
    await capture(page, "activity-ready");
    const activity = page.getByRole("group", { name: t.activity, exact: true });
    await activity
      .getByRole("button", { name: copy.accounts.workspace.saveContinue, exact: true })
      .click();
    await expect(page.getByRole("button", { name: t.submit, exact: true })).toBeVisible();
    await capture(page, "review-ready");
    await page.getByRole("button", { name: t.submit, exact: true }).click();
    await expect(
      page.getByText(copy.accounts.business.statuses.pending, { exact: true }),
    ).toBeVisible();
    expect(
      (
        await context.request.put(endpoint("draft"), {
          headers: origin,
          data: { ...profile, logo: business.logo },
        })
      ).status(),
    ).toBe(409);
    await capture(page, "pending");
    const sections = await (await context.request.get(endpoint("sections"))).json();
    const file = sections.find((s: { kind: string }) => s.kind === "identity").data.card_front;
    const content = `/api/bff/accounts/onboarding/content?id=${file}`;
    const download = await context.request.get(content);
    expect(download.status()).toBe(200);
    expect(download.headers()["cache-control"]).toBe("no-store");
    expect(await download.body()).toEqual(png);
    const otherPage = await outsider.newPage();
    await login(otherPage, numbers[2]!);
    expect((await outsider.request.get(content)).status()).toBe(404);
    expect((await outsider.request.get(endpoint("sections"))).status()).toBe(404);
    expect((await outsider.request.post(endpoint("claim"), { headers: origin })).status()).toBe(
      403,
    );
    const reviewPage = await reviewer.newPage();
    await login(reviewPage, numbers[1]!);
    expect((await reviewer.request.get(endpoint("sections"))).status()).toBe(404);
    await reviewPage
      .getByRole("button", { name: copy.accounts.workspace.accountMenu, exact: true })
      .click();
    await reviewPage
      .getByRole("menuitem", { name: copy.accounts.workspace.operations, exact: true })
      .click();
    await reviewPage.getByRole("button", { name: t.selectClaim, exact: true }).click();
    await reviewPage.getByRole("button", { name: t.claim, exact: true }).click();
    await expect(reviewPage.getByRole("heading", { name: "Edited workshop" })).toBeVisible();
    if (process.env.ACCOUNT_VISUAL_QA_DIR) {
      await reviewPage.evaluate(() => document.fonts.ready);
      await reviewPage.screenshot({
        path: `${process.env.ACCOUNT_VISUAL_QA_DIR}/operator-case-${locale}.png`,
        animations: "disabled",
        fullPage: true,
      });
      const originalViewport = reviewPage.viewportSize()!;
      for (const theme of ["light", "dark"])
        for (const [viewport, width, height] of [
          ["desktop", 1440, 1000],
          ["mobile", 390, 844],
        ] as const) {
          await reviewPage
            .context()
            .addCookies([
              { name: "directsourcing-theme-v1", value: theme, url: "http://localhost:3100" },
            ]);
          await reviewPage.setViewportSize({ width, height });
          await reviewPage.reload();
          await expect(reviewPage.getByRole("heading", { name: "Edited workshop" })).toBeVisible();
          await reviewPage.waitForLoadState("networkidle");
          await reviewPage.evaluate(() => document.fonts.ready);
          expect(
            await reviewPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
          await reviewPage.screenshot({
            path: `${process.env.ACCOUNT_VISUAL_QA_DIR}/operator-case-${locale}-${theme}-${viewport}.png`,
            animations: "disabled",
          });
        }
      await reviewPage
        .context()
        .addCookies([
          { name: "directsourcing-theme-v1", value: "light", url: "http://localhost:3100" },
        ]);
      await reviewPage.setViewportSize(originalViewport);
      await reviewPage.reload();
    }
    expect((await reviewer.request.get(content)).status()).toBe(200);
    async function decision(kind: string, value: string) {
      await reviewPage.bringToFront();
      await reviewPage.getByLabel(t.section, { exact: true }).selectOption(kind);
      await reviewPage.getByLabel(t.decision, { exact: true }).selectOption(value);
      await reviewPage.getByLabel(t.reason, { exact: true }).fill("Review evidence reason");
      await reviewPage.getByRole("button", { name: t.review, exact: true }).click();
      await expect(reviewPage.getByLabel(t.reason, { exact: true })).toHaveValue("");
    }
    await decision("identity", "approved");
    await decision("activity", "changes_requested");
    await page.goto(`/${locale}/account/business/verification?step=identity`);
    await expect(page.getByLabel(t.nationalId, { exact: true })).toBeDisabled();
    await capture(page, "approved-identity-correction");
    await page
      .getByRole("button", { name: copy.accounts.workspace.activityStep, exact: true })
      .click();
    await page
      .getByRole("group", { name: t.activity, exact: true })
      .getByRole("button", { name: copy.accounts.workspace.saveContinue, exact: true })
      .click();
    await expect(page.getByRole("button", { name: t.submit, exact: true })).toBeVisible();
    await page.getByRole("button", { name: t.submit, exact: true }).click();
    // Refresh the review case after the owner's explicit resubmission.
    await reviewPage.goto(`/${locale}/account/operations/businesses`);
    await reviewPage.getByRole("link", { name: t.openCase, exact: true }).click();
    await decision("activity", "rejected");
    await page.bringToFront();
    await page.reload();
    await expect(page.getByRole("button", { name: t.submit, exact: true })).toHaveCount(0);
    await capture(page, "rejected");
    await reviewPage.getByLabel(t.reason, { exact: true }).fill("New evidence may be supplied");
    await reviewPage.getByRole("button", { name: t.reopen, exact: true }).click();
    await expect(reviewPage.getByLabel(t.section, { exact: true })).toBeVisible();
    await page.bringToFront();
    await page.reload();
    await page
      .getByRole("button", { name: copy.accounts.workspace.activityStep, exact: true })
      .click();
    await page
      .getByRole("group", { name: t.activity, exact: true })
      .getByRole("button", { name: copy.accounts.workspace.saveContinue, exact: true })
      .click();
    await expect(page.getByRole("button", { name: t.submit, exact: true })).toBeVisible();
    await page.getByRole("button", { name: t.submit, exact: true }).click();
    await reviewPage.goto(`/${locale}/account/operations/businesses`);
    await reviewPage.getByRole("link", { name: t.openCase, exact: true }).click();
    await decision("activity", "approved");
    await page.bringToFront();
    await page.reload();
    await expect(
      page.getByText(copy.accounts.business.statuses.verified, { exact: true }),
    ).toBeVisible();
    await capture(page, "verified");
    const final = await (await context.request.get("/api/bff/accounts/business")).json();
    expect(final.controlled_access).toBe(false);
    expect(final.first_verified_at).toBeTruthy();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const trust = copy.accounts.trust;
    const trustUrl = (action: string, id = business.id) =>
      `/api/bff/accounts/trust/${action}?id=${id}`;
    // A verified profile stays published until the assigned reviewer approves the revision.
    await page.goto(`/${locale}/account/business/revisions`);
    await page.getByRole("button", { name: trust.editRevision, exact: true }).click();
    await page.getByRole("checkbox", { name: trust.profile, exact: true }).check();
    await page
      .getByLabel(copy.accounts.business.fields.name, { exact: true })
      .fill("Revised workshop");
    await page
      .getByRole("button", { name: copy.accounts.business.prepareRevision, exact: true })
      .click();
    await page.getByRole("button", { name: trust.submitRevision, exact: true }).click();
    await expect(page.getByRole("button", { name: trust.submitRevision, exact: true })).toHaveCount(
      0,
    );
    expect((await (await context.request.get("/api/bff/accounts/business")).json()).name).toBe(
      "Edited workshop",
    );
    const revisions = await (await context.request.get(trustUrl("revisions"))).json();
    const revision = revisions.results[0];
    expect((await outsider.request.get(trustUrl("revision", revision.id))).status()).toBe(404);
    await reviewPage.goto(`/${locale}/account/operations/trust`);
    await reviewPage.getByRole("button", { name: trust.selectClaim, exact: true }).click();
    await reviewPage.getByRole("button", { name: trust.claim, exact: true }).click();
    await reviewPage.getByLabel(trust.section, { exact: true }).selectOption("activity");
    await reviewPage.getByLabel(trust.reason, { exact: true }).fill("Revision evidence checked");
    await reviewPage.getByRole("button", { name: trust.review, exact: true }).click();
    await expect(reviewPage.getByRole("button", { name: trust.review, exact: true })).toHaveCount(
      0,
    );
    await page.bringToFront();
    await page.reload();
    const revised = await (await context.request.get("/api/bff/accounts/business")).json();
    expect(revised.name).toBe("Revised workshop");
    expect(revised.logo).toBe(final.logo);
    expect(revised.first_verified_at).toBe(final.first_verified_at);
    // Only the system owner can change controlled access or activate a proposed suspension.
    expect(
      (
        await reviewer.request.post(trustUrl("controlled"), {
          headers: origin,
          data: { enabled: true, reason: "Not authorized" },
        })
      ).status(),
    ).toBe(403);
    await pool.query(
      "INSERT INTO accounts_platformrole (id,created_at,updated_at,user_id,role,is_active) SELECT $1,now(),now(),id,'owner',true FROM accounts_user WHERE mobile=$2",
      [randomUUID(), `+98${numbers[2]!.slice(1)}`],
    );
    await otherPage.goto(`/${locale}/account/operations/trust`);
    const controls = otherPage
      .getByRole("heading", { name: trust.accountControls, exact: true })
      .locator("..");
    const directory = await (await outsider.request.get(trustUrl("directory"))).json();
    const member = directory.results.find(
      (row: { business: { id: string } | null }) => row.business?.id === business.id,
    );
    await controls.getByLabel(trust.account, { exact: true }).selectOption(member.id);
    await controls.getByLabel(trust.reason, { exact: true }).fill("Controlled trial granted");
    await controls.getByRole("button", { name: trust.execute, exact: true }).click();
    await expect(otherPage.getByText(trust.controlledOn, { exact: true })).toBeVisible();
    await controls.getByLabel(trust.command, { exact: true }).selectOption("revoke");
    await controls.getByLabel(trust.reason, { exact: true }).fill("Controlled trial ended");
    const revokeResponse = otherPage.waitForResponse(
      (response) =>
        response.request().method() === "POST" && response.url().includes("/trust/controlled"),
    );
    await controls.getByRole("button", { name: trust.execute, exact: true }).click();
    const revoked = await revokeResponse;
    expect(revoked.status(), await revoked.text()).toBe(200);
    await expect(otherPage.getByText(trust.controlledOff, { exact: true })).toBeVisible();
    const ticketId = randomUUID();
    await pool.query(
      "INSERT INTO support_ticket (id,created_at,updated_at,number,business_id,creator_id,title,category,status,related_type,command_key,request_hash) VALUES ($1,now(),now(),$2,$3,$4,'Existing safety ticket','account','new','',$5,$6)",
      [ticketId, `E2E-${ticketId}`, business.id, member.id, randomUUID(), "0".repeat(64)],
    );
    await controls.getByLabel(trust.command, { exact: true }).selectOption("suspendBusiness");
    await controls
      .getByLabel(trust.reason, { exact: true })
      .fill(`Business safety review ${business.id}`);
    await expect(controls.getByLabel(trust.command, { exact: true })).toHaveValue(
      "suspendBusiness",
    );
    expect(
      await otherPage.locator("form").evaluateAll((forms) =>
        forms.flatMap((form) =>
          Array.from(form.querySelectorAll<HTMLInputElement>("input,textarea,select"))
            .filter((field) => !field.checkValidity())
            .map((field) => ({
              id: field.id,
              type: field.type,
              validation: field.validationMessage,
            })),
        ),
      ),
    ).toEqual([]);
    await controls.getByRole("button", { name: trust.execute, exact: true }).click();
    const safety = otherPage
      .getByRole("heading", { name: trust.suspension, exact: true })
      .locator("..");
    await safety
      .getByText(`Business safety review ${business.id}`, { exact: true })
      .locator("..")
      .getByRole("button", { name: trust.open, exact: true })
      .click();
    await safety.getByLabel(trust.reason, { exact: true }).fill("Business suspension approved");
    await safety.getByRole("button", { name: trust.execute, exact: true }).click();
    await expect(safety.getByLabel(trust.command, { exact: true })).toHaveValue(
      "suspension_restore",
    );
    await page.goto(`/${locale}/account/access`);
    await expect(page.getByText(trust.restricted, { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: trust.orders, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: trust.tickets, exact: true })).toBeVisible();
    await capture(page, "suspended-access");
    expect((await context.request.get("/api/bff/auth/session")).status()).toBe(200);
    const ticketSection = page
      .getByRole("heading", { name: trust.tickets, exact: true })
      .locator("..");
    await ticketSection.getByRole("button", { name: trust.open, exact: true }).click();
    await page
      .getByLabel(trust.message, { exact: true })
      .fill("Evidence supplied while business is suspended");
    await upload(page, trust.evidence);
    await page.getByRole("button", { name: trust.reply, exact: true }).click();
    await expect(
      page.getByText("Evidence supplied while business is suspended", { exact: true }),
    ).toBeVisible();
    // Support staff may read tickets, but replying requires assignment to this ticket.
    expect((await reviewer.request.get(trustUrl("ticket", ticketId))).status()).toBe(200);
    expect(
      (
        await reviewer.request.post(trustUrl("ticket-reply", ticketId), {
          headers: origin,
          data: { text: "Unassigned reply", files: [], idempotency_key: randomUUID() },
        })
      ).status(),
    ).toBe(403);

    await otherPage.bringToFront();
    await safety.getByLabel(trust.reason, { exact: true }).fill("Business restriction resolved");
    await safety.getByRole("button", { name: trust.execute, exact: true }).click();
    await expect(safety.getByLabel(trust.command, { exact: true })).toHaveCount(0);
    await page.bringToFront();
    await page.reload();
    await expect(page.getByText(trust.restricted, { exact: true })).toHaveCount(0);
    await otherPage.bringToFront();
    await controls.getByLabel(trust.command, { exact: true }).selectOption("suspendUser");
    await controls.getByLabel(trust.reason, { exact: true }).fill("User safety review");
    await controls.getByRole("button", { name: trust.execute, exact: true }).click();
    await safety
      .getByText("User safety review", { exact: true })
      .locator("..")
      .getByRole("button", { name: trust.open, exact: true })
      .click();
    await safety.getByLabel(trust.reason, { exact: true }).fill("User suspension approved");
    await safety.getByRole("button", { name: trust.execute, exact: true }).click();
    await expect(safety.getByLabel(trust.command, { exact: true })).toHaveValue(
      "suspension_restore",
    );
    await page.bringToFront();
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`/${locale}/login`));
    expect((await context.request.get("/api/bff/accounts/business")).status()).toBe(401);
    const stillVerified = await pool.query("SELECT status FROM accounts_business WHERE id=$1", [
      business.id,
    ]);
    expect(stillVerified.rows[0].status).toBe("verified");
    await otherPage.bringToFront();
    await safety.getByLabel(trust.reason, { exact: true }).fill("User access restored");
    await safety.getByRole("button", { name: trust.execute, exact: true }).click();
    await expect(safety.getByLabel(trust.command, { exact: true })).toHaveCount(0);
    await login(page, numbers[0]!);

    const operatorAccount = directory.results.find(
      (row: { mobile: string }) => row.mobile === `+98${numbers[1]!.slice(1)}`,
    );
    await controls.getByLabel(trust.account, { exact: true }).selectOption(operatorAccount.id);
    await controls.getByLabel(trust.command, { exact: true }).selectOption("revokeOperator");
    await controls.getByLabel(trust.reason, { exact: true }).fill("Operator assignment ended");
    await controls.getByRole("button", { name: trust.execute, exact: true }).click();
    await expect(otherPage.getByText(trust.operatorOff, { exact: true })).toBeVisible();
    expect((await reviewer.request.get(content)).status()).toBe(404);
    expect((await reviewer.request.get("/api/bff/accounts/onboarding/queue")).status()).toBe(403);
    await signOut(page, copy);
    await expect(page).toHaveURL(new RegExp(`/${locale}$`));
    expect((await context.request.get(content)).status()).toBe(401);
  } finally {
    await reviewer.close();
    await outsider.close();
    await pool.end();
  }
});

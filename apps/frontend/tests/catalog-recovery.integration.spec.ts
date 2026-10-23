import { readFile, writeFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import en from "../messages/en.json" with { type: "json" };
import fa from "../messages/fa.json" with { type: "json" };
import { publicProductPageSchema } from "../src/features/catalog/schemas/public-catalog.schema";

for (const [locale, messages] of [
  ["en", en],
  ["fa", fa],
] as const) {
  test(`${locale}: real catalogue timeout preserves URL and Retry recovers public content`, async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const pidFile = process.env.E2E_RECOVERY_PID_FILE;
    if (!pidFile) throw new Error("Recovery runner PID file missing");
    const pid = Number(await readFile(pidFile, "utf8"));
    if (!Number.isSafeInteger(pid) || pid <= 1) throw new Error("Invalid owned runner PID");
    const products = publicProductPageSchema.parse(
      await (await request.get("http://127.0.0.1:8001/api/v1/catalog/public/products/")).json(),
    );
    const product = products.results[0];
    if (!product) throw new Error("Published fixture missing");
    const query = new URLSearchParams({
      q: "کفش",
      manufacturer: product.manufacturer.id,
      method: "free_mix",
    });
    const route = `/${locale}/catalog?${query}`;
    const manifest = [];
    let stopped = false;
    try {
      // Pause only this config's disposable Django child; produce a real transport timeout.
      process.kill(pid, "SIGSTOP");
      stopped = true;
      await page.goto(route);
      await expect(page.getByRole("main").getByRole("alert")).toContainText(messages.common.error, {
        timeout: 30_000,
      });
      await expect(
        page.getByRole("button", { name: messages.common.retry, exact: true }),
      ).toBeVisible();
      expect(new URL(page.url()).searchParams.toString()).toBe(query.toString());
      await expect(page.locator("main")).not.toContainText(
        /AbortError|TimeoutError|Bearer|stack trace/u,
      );
      for (const theme of ["light", "dark"] as const) {
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.getByRole("button", { name: messages.theme[theme], exact: true }).click();
        for (const [viewport, size] of [
          ["desktop", { width: 1440, height: 1000 }],
          ["mobile", { width: 390, height: 844 }],
        ] as const) {
          await page.setViewportSize(size);
          await page.evaluate(() => document.fonts.ready);
          const screenshot = `recovery-screenshots/${locale}__${theme}__${viewport}__error.png`;
          await page.screenshot({
            path: `../../handoff/prd-02-completion-2026-10-12/${screenshot}`,
            animations: "disabled",
          });
          manifest.push({
            actor: "guest",
            locale,
            theme,
            viewport: size,
            route,
            state: "real-backend-timeout",
            screenshot,
            captured_at: new Date().toISOString(),
            render_mode: "production",
          });
        }
      }
      process.kill(pid, "SIGCONT");
      stopped = false;
      await expect
        .poll(async () => (await request.get("http://127.0.0.1:8001/health/live/")).status())
        .toBe(200);
      await page.getByRole("button", { name: messages.common.retry, exact: true }).click();
      await expect(page.getByRole("heading", { name: product.name, exact: true })).toBeVisible({
        timeout: 30_000,
      });
      expect(new URL(page.url()).searchParams.toString()).toBe(query.toString());
      await expect(
        page.getByRole("main").getByRole("alert").filter({ hasText: messages.common.error }),
      ).toHaveCount(0);
      await writeFile(
        `../../handoff/prd-02-completion-2026-10-12/recovery-${locale}-manifest.json`,
        JSON.stringify(manifest, null, 2),
      );
    } finally {
      if (stopped) process.kill(pid, "SIGCONT");
    }
  });
}

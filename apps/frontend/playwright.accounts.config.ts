import { defineConfig, devices } from "@playwright/test";
import registration from "./playwright.registration.config";
const browserName =
  process.env.ACCOUNTS_BROWSER === "webkit"
    ? "webkit"
    : process.env.ACCOUNTS_BROWSER === "firefox"
      ? "firefox"
      : "chromium";
const device =
  browserName === "webkit"
    ? "Desktop Safari"
    : browserName === "firefox"
      ? "Desktop Firefox"
      : process.env.ACCOUNTS_MOBILE === "true"
        ? "Pixel 7"
        : "Desktop Chrome";
export default defineConfig({
  ...registration,
  testMatch: "sessions.integration.spec.ts",
  use: {
    ...registration.use,
    ...devices[device],
    browserName,
    channel: browserName === "chromium" ? process.env.PLAYWRIGHT_CHANNEL : undefined,
  },
});

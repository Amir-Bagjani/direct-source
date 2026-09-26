import { defineConfig, devices } from "@playwright/test";

const production = process.env.PLAYWRIGHT_SERVER_MODE === "production";

export default defineConfig({
  testDir: "./tests",
  testIgnore: "**/*.integration.spec.ts",
  fullyParallel: true,
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    channel: process.env.PLAYWRIGHT_CHANNEL,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: production ? "node tooling/start-e2e-production.mjs" : "pnpm dev --port 3100",
    url: "http://localhost:3100/fa",
    reuseExistingServer: !production && !process.env.CI,
    timeout: 120_000,
  },
});

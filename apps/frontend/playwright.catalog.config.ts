import { randomBytes, randomUUID } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

const databaseName = `test_frontend_${randomUUID().replaceAll("-", "")}`;
const database = new URL(
  process.env.E2E_POSTGRES_URL ??
    "postgresql://marketplace:marketplace@127.0.0.1:55432/marketplace",
);
database.pathname = `/${databaseName}`;
const environment = {
  HOSTNAME: "localhost",
  E2E_DATABASE_NAME: databaseName,
  E2E_CATALOG: "1",
  NEXTAUTH_URL: "http://localhost:3100",
  DJANGO_API_URL: "http://127.0.0.1:8001",
  NEXTAUTH_SECRET: randomBytes(32).toString("hex"),
  SESSION_VAULT_KEY: randomBytes(32).toString("hex"),
  FRONTEND_DATABASE_URL: database.href,
};

export default defineConfig({
  testDir: "./tests",
  testMatch: "catalog.integration.spec.ts",
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://localhost:3100",
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    { name: "en-desktop", grep: /en:/u, use: { ...devices["Desktop Chrome"] } },
    { name: "fa-mobile", grep: /fa:/u, use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: "../backend/.venv/bin/python tooling/start-e2e-backend.py",
      url: "http://127.0.0.1:8001/health/live/",
      env: environment,
      timeout: 120_000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
    },
    {
      command:
        process.env.PLAYWRIGHT_SERVER_MODE === "production"
          ? "node tooling/start-e2e-production.mjs"
          : "pnpm dev --webpack --port 3100",
      url: "http://localhost:3100/en/catalog",
      env:
        process.env.PLAYWRIGHT_SERVER_MODE === "production"
          ? environment
          : { ...environment, NEXT_DIST_DIR: ".next-e2e-catalog" },
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});

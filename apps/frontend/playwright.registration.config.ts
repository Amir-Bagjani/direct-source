import { randomBytes, randomUUID } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

if (!process.env.E2E_AUTH_ENV) {
  const databaseName = `test_frontend_${randomUUID().replaceAll("-", "")}`;
  const database = new URL(
    process.env.E2E_POSTGRES_URL ??
      "postgresql://marketplace:marketplace@127.0.0.1:55432/marketplace",
  );
  database.pathname = `/${databaseName}`;
  process.env.E2E_AUTH_ENV = JSON.stringify({
    HOSTNAME: "localhost",
    E2E_DATABASE_NAME: databaseName,
    NEXTAUTH_URL: "http://localhost:3100",
    DJANGO_API_URL: "http://127.0.0.1:8001",
    NEXTAUTH_SECRET: randomBytes(32).toString("hex"),
    SESSION_VAULT_KEY: randomBytes(32).toString("hex"),
    FRONTEND_DATABASE_URL: database.href,
  });
}
const authEnv: Record<string, string> = JSON.parse(process.env.E2E_AUTH_ENV);
Object.assign(process.env, authEnv);
export default defineConfig({
  testDir: "./tests",
  testMatch: "registration.integration.spec.ts",
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://localhost:3100",
    ...devices["Desktop Chrome"],
    channel: process.env.PLAYWRIGHT_CHANNEL,
    launchOptions: { ignoreDefaultArgs: ["--disable-back-forward-cache"] },
    // Credentials must never enter traces, videos or screenshots, even on failure.
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  webServer: [
    {
      command: "../backend/.venv/bin/python tooling/start-e2e-backend.py",
      url: "http://127.0.0.1:8001/health/live/",
      env: authEnv,
      timeout: 120_000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
    },
    {
      command:
        process.env.PLAYWRIGHT_SERVER_MODE === "production"
          ? "node tooling/start-e2e-production.mjs"
          : "pnpm dev --port 3100",
      url: "http://localhost:3100/en/register",
      timeout: 120_000,
      reuseExistingServer: false,
      env: authEnv,
    },
    {
      command: "node tooling/start-e2e-production.mjs",
      url: "http://127.0.0.1:3101/en/login",
      timeout: 120_000,
      reuseExistingServer: false,
      env: { ...authEnv, PORT: "3101", HOSTNAME: "127.0.0.1" },
    },
  ],
});

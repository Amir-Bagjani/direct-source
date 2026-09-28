import { defineConfig } from "@playwright/test";
import accounts from "./playwright.accounts.config";
process.env.E2E_DOCUMENTS = "1";
export default defineConfig({
  ...accounts,
  testMatch: "onboarding.integration.spec.ts",
  timeout: 120000,
});

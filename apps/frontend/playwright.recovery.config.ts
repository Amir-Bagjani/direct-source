import { defineConfig } from "@playwright/test";
import accounts from "./playwright.accounts.config";
process.env.E2E_CAPTURE_MAIL = "1";
export default defineConfig({ ...accounts, testMatch: "recovery.integration.spec.ts" });

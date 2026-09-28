import { defineConfig } from "@playwright/test";
import accounts from "./playwright.accounts.config";
export default defineConfig({ ...accounts, testMatch: "business.integration.spec.ts" });

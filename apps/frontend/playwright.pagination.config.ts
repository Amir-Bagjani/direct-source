import { defineConfig } from "@playwright/test";
import prd02 from "./playwright.prd02.config";

process.env.E2E_CATALOG_PAGINATION = "1";
export default defineConfig({ ...prd02, testMatch: "pagination.integration.spec.ts" });

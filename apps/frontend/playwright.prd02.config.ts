import { defineConfig } from "@playwright/test";
import catalog from "./playwright.catalog.config";

process.env.E2E_CATALOG_MEDIA = "1";

export default defineConfig({
  ...catalog,
  testMatch: [
    "catalog.integration.spec.ts",
    "prd02.visual.spec.ts",
    "product-detail.integration.spec.ts",
    "selection.integration.spec.ts",
    "preview.integration.spec.ts",
    "revision.integration.spec.ts",
    "authoring.integration.spec.ts",
  ],
});

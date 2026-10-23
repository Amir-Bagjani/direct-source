import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";
import prd02 from "./playwright.prd02.config";

process.env.E2E_RECOVERY_PID_FILE ??= join(tmpdir(), `directsourcing-recovery-${randomUUID()}.pid`);
export default defineConfig({ ...prd02, testMatch: "catalog-recovery.integration.spec.ts" });

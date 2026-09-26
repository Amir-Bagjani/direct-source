"use client";
import type { z } from "zod";
import { bffRequest } from "@/shared/api/browser-client";
import { recoveryInputs, recoveryResultSchema } from "../schemas/recovery.schema";
import type { RecoveryAction } from "../schemas/recovery.schema";
export function submitRecovery<A extends RecoveryAction>(
  action: A,
  input: z.input<(typeof recoveryInputs)[A]>,
) {
  return bffRequest(`/api/bff/auth/recovery/${action}`, recoveryResultSchema, {
    method: action === "email" ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(recoveryInputs[action].parse(input)),
  });
}

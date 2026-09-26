import { z } from "zod";
import type { components } from "@/shared/api/openapi";

export const emailChangeSchema = z.object({
  email: z.union([z.email().max(254), z.literal("")]),
  current_password: z.string().min(1).max(128),
}) satisfies z.ZodType<components["schemas"]["EmailChangeRequest"]>;
export const resetRequestSchema = z.object({ email: z.email().max(254) });
export const challengeInputSchema = z.object({
  purpose: z.enum(["verify", "reset"]),
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});
export const newPasswordSchema = z.object({ password: z.string().min(12).max(128) });
export const recoveryInputs = {
  email: emailChangeSchema,
  "request-verification": z.object({}),
  "request-reset": resetRequestSchema,
  confirm: z.object({ token: challengeInputSchema.shape.token }),
  reset: newPasswordSchema.extend({ token: challengeInputSchema.shape.token }),
};
export type RecoveryAction = keyof typeof recoveryInputs;
export const recoveryResultSchema = z.object({ accepted: z.literal(true) });

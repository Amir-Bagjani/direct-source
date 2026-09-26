import { z } from "zod";
import type { components } from "@/shared/api/openapi";

import { normalizeMobile } from "../utils/normalize-mobile";

export const registrationSchema = z.object({
  first_name: z.string().trim().min(1, "name").max(150, "name"),
  last_name: z.string().trim().min(1, "name").max(150, "name"),
  mobile: z
    .string()
    .transform(normalizeMobile)
    .pipe(z.string().regex(/^\+989[0-9]{9}$/, "mobile")),
  password: z.string().min(12, "password").max(128, "password"),
  email: z.union([z.email({ error: "email" }), z.literal("")]).default(""),
  accept_terms: z.boolean().refine((accepted) => accepted, "terms"),
}) satisfies z.ZodType<components["schemas"]["RegisterRequest"]>;

export type RegistrationInput = z.input<typeof registrationSchema>;

export const registeredUserSchema = z.object({
  id: z.uuid(),
  mobile: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  email: z.string(),
  email_verified_at: z.string().nullable(),
}) satisfies z.ZodType<components["schemas"]["User"]>;

// The browser needs confirmation, not a duplicate of the submitted personal data.
export const registrationResultSchema = z.object({ created: z.literal(true) });

import { normalizeDigits } from "../utils/normalize-digits";
import { z } from "zod";
import type { components } from "@/shared/api/openapi";

const kind = z.enum(["manufacturer", "retailer"]);
const address = z.object({
  province: z.string().trim().min(1).max(100),
  city: z.string().trim().min(1).max(100),
  address: z.string().trim().min(1).max(1000),
});
export const businessInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  kind,
  phone: z
    .string()
    .trim()
    .transform(normalizeDigits)
    .pipe(z.string().regex(/^\+?[0-9]{7,15}$/)),
  description: z.string().trim().min(1).max(2000),
  address,
}) satisfies z.ZodType<components["schemas"]["BusinessInputRequest"]>;
export type BusinessInput = z.input<typeof businessInputSchema>;
export const businessSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  kind,
  status: z.enum(["draft", "pending", "changes_requested", "verified", "rejected", "suspended"]),
  phone: z.string(),
  description: z.string(),
  logo: z.uuid().nullable(),
  controlled_access: z.boolean(),
  first_verified_at: z.string().nullable(),
  addresses: z.array(address.extend({ id: z.uuid() })),
}) satisfies z.ZodType<components["schemas"]["Business"]>;
export const businessResultSchema = businessSchema.nullable();
export const businessListSchema = z
  .object({ count: z.number().int().min(0).max(1), results: z.array(businessSchema).max(1) })
  .refine((value) => value.count === value.results.length);

export const businessCreatedSchema = z.object({ created: z.literal(true) });

export const businessDraftSchema = businessInputSchema
  .omit({ kind: true })
  .extend({ logo: z.uuid().nullable() });
export type BusinessDraft = z.input<typeof businessDraftSchema>;

import { z } from "zod";
import { normalizeDigits } from "../utils/normalize-digits";
export const sectionKindSchema = z.enum(["identity", "activity"]);
export const identitySchema = z.object({
  national_id: z
    .string()
    .transform(normalizeDigits)
    .pipe(z.string().regex(/^[0-9]{10}$/)),
  birth_date: z.iso.date().refine((value) => value < new Date().toISOString().slice(0, 10)),
  card_front: z.uuid(),
  card_back: z.uuid(),
  selfie: z.uuid(),
});
export const activitySchema = z
  .object({
    evidence_type: z.enum(["license", "alternative"]),
    files: z.array(z.uuid()).min(1).max(10),
  })
  .refine(
    (v) =>
      new Set(v.files).size === v.files.length &&
      (v.evidence_type !== "alternative" || v.files.length >= 2),
  );
export const sectionSchema = z.object({
  kind: sectionKindSchema,
  status: z.enum(["draft", "pending", "approved", "changes_requested", "rejected"]),
  data: z.record(z.string(), z.unknown()),
  reason: z.string(),
});
export const sectionsSchema = z.array(sectionSchema).length(2);
export type VerificationSection = z.infer<typeof sectionSchema>;
export const reasonSchema = z.object({ reason: z.string().trim().min(1).max(2000) });
export const reviewSchema = reasonSchema.extend({
  kind: sectionKindSchema,
  decision: z.enum(["approved", "changes_requested", "rejected"]),
});
export const policySchema = z.object({ consent_version: z.string().min(1).max(40) });
export const fileSchema = z.object({
  id: z.uuid(),
  purpose: z.enum(["identity", "activity", "business_logo", "suspension", "support"]),
  size: z.number(),
  content_type: z.string(),
  scan_status: z.literal("clean"),
});
export const completeSchema = z.object({ completed: z.literal(true) });
export const queueSchema = z.object({
  count: z.number().int().nonnegative(),
  results: z.array(
    z.object({
      id: z.uuid(),
      business_id: z.uuid(),
      assigned_to_id: z.uuid().nullable(),
      submitted_at: z.string().nullable(),
      status: z.enum(["pending", "changes_requested", "rejected"]),
    }),
  ),
});
export const onboardingActionSchema = z.enum([
  "policy",
  "queue",
  "detail",
  "sections",
  "draft",
  "identity",
  "activity",
  "submit",
  "claim",
  "review",
  "reopen",
  "upload",
  "content",
]);
export type OnboardingAction = z.infer<typeof onboardingActionSchema>;

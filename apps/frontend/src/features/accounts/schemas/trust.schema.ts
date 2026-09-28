import { z } from "zod";
import { businessDraftSchema, businessSchema } from "./business.schema";
import { identitySchema, activitySchema } from "./onboarding.schema";
export const revisionChangesSchema = z
  .object({
    profile: businessDraftSchema.optional(),
    identity: identitySchema.optional(),
    activity: activitySchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0);
export type RevisionChanges = z.infer<typeof revisionChangesSchema>;
const snapshot = z.object({
  profile: businessDraftSchema
    .omit({ logo: true })
    .extend({ logo: z.uuid().nullable().optional() }),
  identity: z.record(z.string(), z.unknown()),
  activity: z.record(z.string(), z.unknown()),
});
export const revisionSchema = z.object({
  id: z.uuid(),
  business_id: z.uuid(),
  assigned_to_id: z.uuid().nullable(),
  status: z.enum(["pending", "changes_requested", "approved", "rejected"]),
  identity_status: z.enum(["pending", "changes_requested", "approved", "rejected"]),
  activity_status: z.enum(["pending", "changes_requested", "approved", "rejected"]),
  identity_reason: z.string(),
  activity_reason: z.string(),
  before: snapshot,
  proposed: snapshot,
  created_at: z.string(),
});
export type BusinessRevision = z.infer<typeof revisionSchema>;
export const revisionPageSchema = z.object({ count: z.number(), results: z.array(revisionSchema) });
export const revisionQueueSchema = z.object({
  count: z.number(),
  results: z.array(
    z.object({
      id: z.uuid(),
      business_id: z.uuid(),
      assigned_to_id: z.uuid().nullable(),
      created_at: z.string(),
    }),
  ),
});
export const trustAccessSchema = z.object({ owner: z.boolean() });
export const directorySchema = z.object({
  count: z.number(),
  results: z.array(
    z.object({
      id: z.uuid(),
      first_name: z.string(),
      last_name: z.string(),
      mobile: z.string(),
      is_suspended: z.boolean(),
      operator: z.boolean(),
      business: businessSchema.nullable(),
    }),
  ),
});
export const workPageSchema = z.object({
  count: z.number(),
  results: z.array(
    z.object({
      kind: z.enum(["suspension", "disposition"]),
      target: z.uuid(),
      reason: z.string(),
      status: z.string(),
      assigned_to: z.uuid().nullable(),
      created_at: z.string(),
      commands: z.array(z.string()),
    }),
  ),
});
export const timelineSchema = z.object({
  data: z.object({
    details: z.record(z.string(), z.unknown()),
    history: z.object({
      count: z.number(),
      results: z.array(
        z.object({
          id: z.uuid(),
          actor_id: z.uuid().nullable(),
          action: z.string(),
          reason: z.string(),
          created_at: z.string(),
        }),
      ),
    }),
  }),
});
export const suspensionPageSchema = z.object({
  count: z.number(),
  results: z.array(
    z.object({
      id: z.uuid(),
      status: z.string(),
      reason: z.string(),
      created_at: z.string(),
      activated_at: z.string().nullable(),
      restored_at: z.string().nullable(),
    }),
  ),
});
export const suspensionInputSchema = z
  .object({
    business_id: z.uuid().optional(),
    user_id: z.uuid().optional(),
    reason: z.string().trim().min(1).max(2000),
    evidence: z.array(z.uuid()).max(10).default([]),
  })
  .refine((v) => Boolean(v.business_id) !== Boolean(v.user_id));
export const commandSchema = z.object({
  command: z.enum([
    "suspension_activate",
    "suspension_reject",
    "suspension_restore",
    "disposition_decide",
  ]),
  reason: z.string().trim().min(1).max(2000),
  idempotency_key: z.uuid(),
  parameters: z.object({ decision: z.enum(["continue", "cancel_refund"]).optional() }).default({}),
});
export const orderHistorySchema = z.object({
  count: z.number(),
  results: z.array(
    z.object({
      id: z.uuid(),
      status: z.string(),
      decision_reason: z.string(),
      commercial: z.object({ goods_total_irr: z.number().optional() }),
      lines: z.array(z.object({ sku: z.string(), quantity: z.number() })),
    }),
  ),
});
export const ticketPageSchema = z.object({
  count: z.number(),
  results: z.array(
    z.object({ id: z.uuid(), number: z.string(), title: z.string(), status: z.string() }),
  ),
});
export const ticketMessageSchema = z.object({
  id: z.uuid(),
  actor: z.uuid().nullable(),
  text: z.string(),
  files: z.array(z.uuid()),
  created_at: z.string(),
});
export const ticketSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  status: z.string(),
  messages: z.array(ticketMessageSchema),
});
export const ticketReplySchema = z.object({
  text: z.string().trim().min(1).max(8000),
  files: z.array(z.uuid()).max(10),
  idempotency_key: z.uuid(),
});
export const trustActionSchema = z.enum([
  "revisions",
  "revision",
  "revision-create",
  "revision-update",
  "revision-queue",
  "revision-claim",
  "revision-review",
  "access",
  "directory",
  "controlled",
  "operator",
  "suspension-propose",
  "work",
  "work-claim",
  "work-command",
  "timeline",
  "own-suspensions",
  "orders",
  "tickets",
  "ticket",
  "ticket-reply",
]);
export type TrustAction = z.infer<typeof trustActionSchema>;

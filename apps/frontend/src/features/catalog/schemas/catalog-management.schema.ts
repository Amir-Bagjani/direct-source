import { z } from "zod";

const uuid = z.uuid();
const nullableUuid = uuid.nullable();
const page = <T extends z.ZodType>(item: T) =>
  z.object({
    count: z.number().int().nonnegative(),
    next: z.string().nullable().optional(),
    previous: z.string().nullable().optional(),
    results: z.array(item),
  });

export const categorySchema = z.object({
  id: uuid,
  name: z.string(),
  slug: z.string(),
  parent: nullableUuid,
  description: z.string(),
  position: z.number().int(),
  is_active: z.boolean(),
});

export const optionSchema = z.object({
  id: uuid,
  attribute: uuid,
  code: z.string(),
  label: z.string(),
  position: z.number().int(),
  is_active: z.boolean(),
});

export const attributeSchema = z.object({
  id: uuid,
  category: uuid,
  code: z.string(),
  name: z.string(),
  description: z.string(),
  kind: z.enum(["choice", "number", "text"]),
  scope: z.enum(["product", "variant"]),
  unit: z.string(),
  required: z.boolean(),
  filterable: z.boolean(),
  position: z.number().int(),
  is_active: z.boolean(),
  options: z.array(optionSchema),
});

const productStatus = z.enum([
  "draft",
  "pending",
  "changes_requested",
  "published",
  "rejected",
  "inactive",
]);

export const productSchema = z.object({
  id: uuid,
  business: uuid,
  category: uuid,
  name: z.string(),
  description: z.string(),
  brand: z.string(),
  manufacturer_model: z.string(),
  attributes: z.record(z.string(), z.unknown()),
  images: z.array(uuid),
  status: productStatus,
  created_at: z.string(),
  updated_at: z.string(),
  assigned_to: nullableUuid.optional(),
  submitted_at: z.string().nullable().optional(),
  published_at: z.string().nullable().optional(),
  decision_code: z.string().optional(),
  decision_reason: z.string().optional(),
});

export const variantSchema = z.object({
  id: uuid,
  product: uuid,
  sku: z.string(),
  attributes: z.record(z.string(), z.unknown()),
  images: z.array(uuid),
  effective_images: z.array(uuid),
  is_active: z.boolean(),
  disabled_code: z.string(),
  status_reason: z.string(),
});

export const supplySchema = z.object({
  mode: z.enum(["ready", "production", "hybrid"]),
  ready_stock: z.number().int().nonnegative(),
  production_cap: z.number().int().nonnegative(),
  lead_time_days: z.number().int().nonnegative(),
});

const selectionSchema = z.object({ variant: uuid, quantity: z.number().int().positive() });
const overrideSchema = z.object({ variant: uuid, unit_price_irr: z.number().int().positive() });
const tierInputSchema = z.object({
  min_quantity: z.number().int().positive(),
  unit_price_irr: z.number().int().positive(),
  overrides: z.array(overrideSchema),
});
export const salesPlanInputSchema = z.object({
  free_mix_min: z.number().int().positive().nullable(),
  packs: z.array(
    z.object({
      code: z.string().min(1).max(60),
      name: z.string().min(1).max(120),
      items: z.array(selectionSchema).min(1),
    }),
  ),
  tiers: z.array(tierInputSchema).min(1),
});
export const salesPlanSchema = salesPlanInputSchema.extend({
  tiers: z.array(
    tierInputSchema.extend({
      max_quantity: z.number().int().positive().nullable(),
      effective_prices: z.array(overrideSchema),
    }),
  ),
  currency: z.string(),
});

export const packageSchema = z.object({
  variant: uuid,
  weight_g: z.number().int().positive(),
  length_mm: z.number().int().positive(),
  width_mm: z.number().int().positive(),
  height_mm: z.number().int().positive(),
  package_count: z.number().int().positive(),
});
export const shippingInputSchema = z.object({
  origin: uuid,
  services: z.array(uuid).min(1),
  packages: z.array(packageSchema).min(1),
});
export const serviceSchema = z.object({
  id: uuid,
  name: z.string(),
  kind: z.string(),
  is_active: z.boolean(),
  operational: z.boolean(),
  delivery_days_min: z.number().int(),
  delivery_days_max: z.number().int(),
  max_weight_g: z.number().int(),
});

export const proposalSchema = z.object({
  id: uuid,
  business: uuid,
  kind: z.enum(["category", "attribute", "option"]),
  category: nullableUuid,
  attribute: nullableUuid,
  name: z.string(),
  description: z.string(),
  example: z.string(),
  status: z.enum(["pending", "approved", "rejected"]),
  reason: z.string(),
  reviewed_by: nullableUuid,
  result_id: nullableUuid,
  created_at: z.string(),
});

export const revisionSchema = z.object({
  id: uuid,
  product: uuid,
  status: z.enum(["draft", "pending", "changes_requested", "approved", "rejected", "cancelled"]),
  before: z.record(z.string(), z.unknown()),
  proposed: z.record(z.string(), z.unknown()),
  assigned_to: nullableUuid,
  reason: z.string(),
  code: z.string(),
  created_at: z.string(),
});

export const studioAccessSchema = z.object({
  scope: uuid,
  business: z
    .object({
      id: uuid,
      name: z.string(),
      kind: z.enum(["manufacturer", "retailer"]),
      status: z.string(),
      addresses: z.array(
        z.object({ id: uuid, province: z.string(), city: z.string(), address: z.string() }),
      ),
    })
    .nullable(),
  operator: z.boolean(),
  owner: z.boolean(),
  consent_version: z.string().min(1).max(40),
});

export const taxonomySchema = z.object({
  categories: z.array(categorySchema),
  attributes: z.array(attributeSchema),
  options: z.array(optionSchema),
});
export const studioSchema = z.object({
  taxonomy: taxonomySchema,
  products: z.array(productSchema),
  proposals: z.array(proposalSchema),
});
export const editorSchema = z.object({
  product: productSchema,
  variants: z.array(variantSchema),
  sales_plan: salesPlanSchema.nullable(),
  shipping: shippingInputSchema.nullable(),
  supplies: z.record(z.string(), supplySchema),
  services: z.array(serviceSchema),
  taxonomy: taxonomySchema,
});

const queueItemSchema = z.object({
  id: uuid,
  name: z.string(),
  business: uuid,
  status: productStatus,
  assigned_to: nullableUuid,
  submitted_at: z.string().nullable(),
});
const revisionQueueItemSchema = z.object({
  id: uuid,
  product: uuid,
  status: z.string(),
  assigned_to: nullableUuid,
  created_at: z.string(),
});
export const operatorDashboardSchema = z.object({
  taxonomy: taxonomySchema,
  products: z.array(queueItemSchema),
  revisions: z.array(revisionQueueItemSchema),
  proposals: z.array(proposalSchema),
});
export const reviewDetailSchema = z.object({
  product: productSchema,
  variants: z.array(variantSchema),
  sales_plan: salesPlanSchema.nullable(),
  shipping: shippingInputSchema.nullable(),
  supplies: z.array(supplySchema.extend({ variant: uuid })),
});

export const productPageSchema = page(productSchema);
export const variantPageSchema = page(variantSchema);
export const categoryPageSchema = page(categorySchema);
export const attributePageSchema = page(attributeSchema);
export const optionPageSchema = page(optionSchema);
export const servicePageSchema = page(serviceSchema);
export const proposalPageSchema = page(proposalSchema);
export const productQueueSchema = page(queueItemSchema);
export const revisionQueueSchema = page(revisionQueueItemSchema);

export const productInputSchema = productSchema.pick({
  business: true,
  category: true,
  name: true,
  description: true,
  brand: true,
  manufacturer_model: true,
  attributes: true,
  images: true,
});
export const variantInputSchema = variantSchema.pick({ sku: true, attributes: true, images: true });
export const supplyInputSchema = supplySchema;
export const reasonInputSchema = z.object({ reason: z.string().trim().min(1).max(2000) });
export const reviewInputSchema = reasonInputSchema.extend({
  decision: z.enum(["published", "changes_requested", "rejected"]),
  code: z.string().trim().min(1).max(60),
});
export const revisionReviewInputSchema = reasonInputSchema.extend({
  decision: z.enum(["approved", "changes_requested", "rejected"]),
  code: z.string().trim().min(1).max(60),
});
export const proposalInputSchema = z.object({
  business: uuid,
  kind: z.enum(["category", "attribute", "option"]),
  category: uuid.nullable(),
  attribute: uuid.nullable(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
  example: z.string().trim().min(1).max(2000),
});
export const taxonomyMutationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("category"),
    id: uuid.optional(),
    name: z.string().min(1),
    slug: z.string().min(1),
    parent: nullableUuid,
    description: z.string(),
    position: z.number().int(),
    is_active: z.boolean(),
    reason: z.string().optional(),
  }),
  z.object({
    kind: z.literal("attribute"),
    id: uuid.optional(),
    category: uuid,
    code: z.string().min(1),
    name: z.string().min(1),
    description: z.string(),
    type: z.enum(["choice", "number", "text"]),
    scope: z.enum(["product", "variant"]),
    unit: z.string(),
    required: z.boolean(),
    filterable: z.boolean(),
    position: z.number().int(),
    is_active: z.boolean(),
    reason: z.string().optional(),
  }),
  z.object({
    kind: z.literal("option"),
    id: uuid.optional(),
    attribute: uuid,
    code: z.string().min(1),
    label: z.string().min(1),
    position: z.number().int(),
    is_active: z.boolean(),
    reason: z.string().optional(),
  }),
]);

export type StudioAccess = z.infer<typeof studioAccessSchema>;
export type Taxonomy = z.infer<typeof taxonomySchema>;
export type Product = z.infer<typeof productSchema>;
export type Variant = z.infer<typeof variantSchema>;
export type Editor = z.infer<typeof editorSchema>;
export type ProductInput = z.infer<typeof productInputSchema>;
export type VariantInput = z.infer<typeof variantInputSchema>;
export type SupplyInput = z.infer<typeof supplyInputSchema>;
export type SalesPlanInput = z.infer<typeof salesPlanInputSchema>;
export type ShippingInput = z.infer<typeof shippingInputSchema>;

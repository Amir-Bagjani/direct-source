import { z } from "zod";
import { attributeSchema, categorySchema } from "./catalog-management.schema";

const categoryPathSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
});

export const publicDiscoverySchema = z
  .object({
    categories: z.array(categorySchema.extend({ path: z.array(categoryPathSchema).min(1) })),
    attributes: z.array(attributeSchema),
    manufacturers: z.array(z.object({ id: z.uuid(), name: z.string() }).strict()),
  })
  .strict();
export type PublicDiscovery = z.infer<typeof publicDiscoverySchema>;

const manufacturerSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
  verified: z.boolean(),
  province: z.string().nullable(),
  city: z.string().nullable(),
  joined_at: z.iso.datetime().nullable(),
  logo_url: z.url().nullable(),
});

const displayAttributeSchema = z.object({
  code: z.string(),
  name: z.string(),
  value: z.unknown(),
  unit: z.string(),
});

const ratingSchema = z.object({
  average: z.number().min(0).max(5).nullable(),
  count: z.number().int().nonnegative(),
});

const supplySchema = z.object({
  mode: z.enum(["ready", "production", "hybrid"]),
  ready_stock: z.number().int().nonnegative(),
  production_cap: z.number().int().nonnegative(),
  lead_time_days: z.number().int().nonnegative(),
});

const publicVariantSchema = z.object({
  id: z.uuid(),
  sku: z.string(),
  attributes: z.record(z.string(), z.unknown()),
  display_attributes: z.array(displayAttributeSchema),
  image_urls: z.array(z.url()),
  orderable: z.boolean(),
  supply: supplySchema.nullable(),
});

const packSchema = z.object({
  code: z.string(),
  name: z.string(),
  items: z.array(z.object({ variant: z.uuid(), quantity: z.number().int().positive() })),
});

const publicProductBaseSchema = z.object({
  id: z.uuid(),
  business: z.uuid(),
  category: z.uuid(),
  name: z.string(),
  description: z.string(),
  brand: z.string(),
  manufacturer_model: z.string(),
  attributes: z.record(z.string(), z.unknown()),
  display_attributes: z.array(displayAttributeSchema),
  image_urls: z.array(z.url()),
  variants: z.array(publicVariantSchema),
  published_at: z.iso.datetime(),
  category_path: z.array(categoryPathSchema),
  manufacturer: manufacturerSummarySchema,
  rating: ratingSchema,
  shipping_services: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      kind: z.string(),
      delivery_days_min: z.number().int().nonnegative(),
      delivery_days_max: z.number().int().nonnegative(),
    }),
  ),
  orderable: z.boolean(),
  lead_time_days: z.number().int().nonnegative().nullable(),
  supply_modes: z.array(z.enum(["ready", "production", "hybrid"])),
  sale_methods: z.array(z.enum(["free_mix", "fixed_pack"])),
  minimum_order: z.number().int().positive().nullable(),
  free_mix_min: z.number().int().positive().nullable(),
  packs: z.array(packSchema),
  price_access_message: z.string().optional(),
});

// The anonymous public boundary deliberately rejects any wholesale amount. A separate,
// identity-scoped schema/key will own retailer prices in the authenticated slice.
export const publicProductSchema = publicProductBaseSchema.strict();

export const publicProductPageSchema = z.object({
  count: z.number().int().nonnegative(),
  next: z.url().nullable().optional(),
  previous: z.url().nullable().optional(),
  results: z.array(publicProductSchema),
});

const irrSchema = z
  .number()
  .int()
  .positive()
  .max(10 ** 15)
  .refine((value) => value % 10 === 0, "irr_must_convert_exactly_to_toman");

const priceCellSchema = z.object({
  variant: z.uuid(),
  unit_price_irr: irrSchema,
});

const wholesalePlanSchema = z.object({
  currency: z.literal("IRR"),
  free_mix_min: z.number().int().positive().nullable(),
  packs: z.array(
    z.object({
      code: z.string(),
      name: z.string(),
      items: z.array(z.object({ variant: z.uuid(), quantity: z.number().int().positive() })),
    }),
  ),
  tiers: z.array(
    z.object({
      min_quantity: z.number().int().positive(),
      max_quantity: z.number().int().positive().nullable(),
      unit_price_irr: irrSchema,
      overrides: z.array(priceCellSchema),
      effective_prices: z.array(priceCellSchema),
    }),
  ),
});

// This contract is accepted only by authenticated, identity-scoped queries. Keeping it
// separate from publicProductSchema prevents an SSR/public cache from ever accepting prices.
export const wholesaleProductSchema = publicProductBaseSchema
  .omit({ price_access_message: true })
  .extend({
    representative_price_irr: irrSchema.nullable(),
    wholesale: wholesalePlanSchema.optional(),
  })
  .strict();

export const wholesaleProductPageSchema = z.object({
  count: z.number().int().nonnegative(),
  next: z.url().nullable().optional(),
  previous: z.url().nullable().optional(),
  results: z.array(wholesaleProductSchema),
});
export const productPreviewSchema = wholesaleProductSchema.extend({
  published_at: z.iso.datetime().nullable(),
});
export type ProductPreview = z.infer<typeof productPreviewSchema>;

export const wholesaleAccessSchema = z.discriminatedUnion("allowed", [
  z.object({ allowed: z.literal(true), scope: z.uuid() }),
  z.object({ allowed: z.literal(false), scope: z.null() }),
]);

export const publicManufacturerSchema = manufacturerSummarySchema.extend({
  logo_url: z.url().nullable(),
  rating: ratingSchema,
  product_count: z.number().int().nonnegative(),
  categories: z.array(categoryPathSchema),
});

export type PublicProduct = z.infer<typeof publicProductSchema>;
export type PublicProductPage = z.infer<typeof publicProductPageSchema>;
export type PublicManufacturer = z.infer<typeof publicManufacturerSchema>;
export type WholesaleProduct = z.infer<typeof wholesaleProductSchema>;
export type WholesaleProductPage = z.infer<typeof wholesaleProductPageSchema>;
export type WholesaleAccess = z.infer<typeof wholesaleAccessSchema>;

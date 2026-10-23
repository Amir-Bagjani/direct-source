import { z } from "zod";

const quantity = z.number().int().min(1).max(1_000_000_000);
export const quoteInputSchema = z.discriminatedUnion("method", [
  z
    .object({
      method: z.literal("free_mix"),
      items: z
        .array(z.object({ variant: z.uuid(), quantity }).strict())
        .min(1)
        .max(100),
    })
    .strict(),
  z
    .object({
      method: z.literal("fixed_pack"),
      pack_code: z
        .string()
        .min(1)
        .max(60)
        .regex(/^[a-zA-Z0-9_-]+$/),
      pack_count: quantity,
    })
    .strict(),
]);
// The BFF preserves the backend's integer tokens as decimal strings before JSON rounding.
const amount = z
  .string()
  .regex(/^[1-9]\d{0,17}0$/, { abort: true })
  .refine((value) => BigInt(value) <= 9223372036854775807n);
export const quoteSchema = z
  .object({
    currency: z.literal("IRR"),
    quantity,
    tier_min_quantity: quantity,
    goods_total_irr: amount,
    lead_time_days: z.number().int().min(0).max(3650),
    lines: z
      .array(
        z
          .object({
            variant: z.uuid(),
            sku: z.string(),
            quantity,
            unit_price_irr: amount,
            total_irr: amount,
            from_ready: z.number().int().min(0).max(1_000_000_000),
            from_production: z.number().int().min(0).max(1_000_000_000),
            lead_time_days: z.number().int().min(0).max(3650),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .refine(
    (quote) =>
      new Set(quote.lines.map((line) => line.variant)).size === quote.lines.length &&
      quote.quantity === quote.lines.reduce((sum, line) => sum + line.quantity, 0) &&
      quote.tier_min_quantity <= quote.quantity &&
      quote.lead_time_days === Math.max(...quote.lines.map((line) => line.lead_time_days)) &&
      BigInt(quote.goods_total_irr) ===
        quote.lines.reduce((sum, line) => sum + BigInt(line.total_irr), 0n) &&
      quote.lines.every(
        (line) =>
          line.quantity === line.from_ready + line.from_production &&
          BigInt(line.total_irr) === BigInt(line.unit_price_irr) * BigInt(line.quantity),
      ),
    "catalog_quote_inconsistent",
  );

export type QuoteInput = z.infer<typeof quoteInputSchema>;
export type Quote = z.infer<typeof quoteSchema>;

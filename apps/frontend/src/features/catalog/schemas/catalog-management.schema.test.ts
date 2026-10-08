import { expect, it } from "vitest";
import { salesPlanInputSchema, studioAccessSchema } from "./catalog-management.schema";

const id = "f81d4fae-7dec-41d0-a765-00a0c91e6bf6";

it("requires positive integer tiers and one available sales method", () => {
  expect(salesPlanInputSchema.safeParse({ free_mix_min: 1, packs: [], tiers: [] }).success).toBe(
    false,
  );
  expect(
    salesPlanInputSchema.safeParse({
      free_mix_min: 12,
      packs: [],
      tiers: [{ min_quantity: 12, unit_price_irr: 1_000_000, overrides: [] }],
    }).success,
  ).toBe(true);
  expect(
    salesPlanInputSchema.safeParse({
      free_mix_min: 12.5,
      packs: [],
      tiers: [{ min_quantity: 12, unit_price_irr: 0, overrides: [] }],
    }).success,
  ).toBe(false);
});

it("strips unexpected credentials from the browser access projection", () => {
  expect(
    studioAccessSchema.parse({
      scope: id,
      business: null,
      operator: true,
      owner: false,
      consent_version: "2026-09-07",
      access: "must-not-cross-bff",
    }),
  ).toEqual({
    scope: id,
    business: null,
    operator: true,
    owner: false,
    consent_version: "2026-09-07",
  });
});

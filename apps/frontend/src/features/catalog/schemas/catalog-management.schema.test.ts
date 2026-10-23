import { expect, it } from "vitest";
import {
  publicationReadinessSchema,
  salesPlanInputSchema,
  studioAccessSchema,
  revisionInputSchema,
  serviceSchema,
} from "./catalog-management.schema";

const id = "f81d4fae-7dec-41d0-a765-00a0c91e6bf6";

it("accepts shipping services without a weight ceiling while rejecting invalid ceilings", () => {
  const service = {
    id,
    name: "Road",
    kind: "road",
    is_active: true,
    operational: true,
    delivery_days_min: 1,
    delivery_days_max: 3,
  };
  for (const max_weight_g of [null, 1000])
    expect(serviceSchema.safeParse({ ...service, max_weight_g }).success).toBe(true);
  for (const max_weight_g of [-1, 0, 1.5, "1000"])
    expect(serviceSchema.safeParse({ ...service, max_weight_g }).success).toBe(false);
});

it("validates full revision variant lists without allowing opaque payloads", () => {
  expect(revisionInputSchema.safeParse({ variants: [] }).success).toBe(false);
  expect(
    revisionInputSchema.safeParse({ variants: [{ id, sku: "SKU", attributes: {}, images: [] }] })
      .success,
  ).toBe(true);
  expect(
    revisionInputSchema.safeParse({
      variants: [{ sku: "new", attributes: {}, images: [], package: { weight_g: -1 } }],
    }).success,
  ).toBe(false);
  expect(revisionInputSchema.safeParse({ variants: ["opaque"] }).success).toBe(false);
  expect(
    revisionInputSchema.safeParse({ profile: { name: "Updated" }, unit_price_irr: 1000 }).success,
  ).toBe(false);
});

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

it("rejects missing, duplicated and inconsistent publication checks", () => {
  const checks = (
    ["business", "content", "variants", "supply", "pricing", "shipping"] as const
  ).map((code) => ({ code, passed: true }));
  expect(publicationReadinessSchema.safeParse({ ready: true, checks }).success).toBe(true);
  expect(publicationReadinessSchema.safeParse({ ready: false, checks }).success).toBe(false);
  expect(
    publicationReadinessSchema.safeParse({ ready: true, checks: checks.slice(1) }).success,
  ).toBe(false);
  expect(
    publicationReadinessSchema.safeParse({ ready: true, checks: checks.map(() => checks[0]) })
      .success,
  ).toBe(false);
  const incomplete = checks.map((check) => ({ ...check, passed: check.code !== "pricing" }));
  expect(publicationReadinessSchema.safeParse({ ready: false, checks: incomplete }).success).toBe(
    true,
  );
  expect(publicationReadinessSchema.safeParse({ ready: true, checks: incomplete }).success).toBe(
    false,
  );
});

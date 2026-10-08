import { expect, it } from "vitest";
import { publicProductSchema, wholesaleProductSchema } from "./public-catalog.schema";

const product = {
  id: "8d29dde8-cb2e-48eb-9f5a-0f401e800f2b",
  business: "bba784d0-752e-453b-b011-71497c636f3d",
  category: "9963686d-ab57-4b2d-963e-67b560ab3980",
  name: "کیف چرمی",
  description: "توضیحات",
  brand: "نمونه",
  manufacturer_model: "M-1",
  attributes: {},
  image_urls: [],
  variants: [],
  published_at: "2026-09-28T10:00:00Z",
  category_path: [],
  manufacturer: {
    id: "bba784d0-752e-453b-b011-71497c636f3d",
    name: "تولیدکننده",
    description: "معرفی",
    verified: true,
    province: "تهران",
    city: "تهران",
    joined_at: "2026-09-01T10:00:00Z",
  },
  rating: { average: null, count: 0 },
  shipping_services: [],
  orderable: false,
  lead_time_days: null,
  supply_modes: [],
  sale_methods: [],
  minimum_order: null,
  free_mix_min: null,
  packs: [],
  price_access_message: "backend copy is not rendered",
};

it("accepts the public projection and rejects wholesale data at the anonymous boundary", () => {
  expect(publicProductSchema.parse(product).name).toBe("کیف چرمی");
  expect(
    publicProductSchema.safeParse({ ...product, representative_price_irr: 1_000_000 }).success,
  ).toBe(false);
  expect(publicProductSchema.safeParse({ ...product, wholesale: {} }).success).toBe(false);
});

it("accepts a complete authenticated wholesale projection and enforces exact toman conversion", () => {
  const wholesale: Record<string, unknown> = {
    ...product,
    price_access_message: undefined,
    representative_price_irr: 1_250_000,
    wholesale: {
      currency: "IRR",
      free_mix_min: 2,
      packs: [],
      tiers: [
        {
          min_quantity: 2,
          max_quantity: null,
          unit_price_irr: 1_250_000,
          overrides: [],
          effective_prices: [],
        },
      ],
    },
  };
  delete wholesale.price_access_message;
  expect(wholesaleProductSchema.parse(wholesale).representative_price_irr).toBe(1_250_000);
  expect(
    wholesaleProductSchema.safeParse({ ...wholesale, representative_price_irr: 1_250_001 }).success,
  ).toBe(false);
});

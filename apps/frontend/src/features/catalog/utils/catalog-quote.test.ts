import { expect, it } from "vitest";
import { parseQuoteResponse } from "./catalog-quote";
import { quoteInputSchema, quoteSchema } from "../schemas/catalog-quote.schema";

const body =
  '{"currency":"IRR","quantity":10000,"tier_min_quantity":1,"goods_total_irr":9000000000000010000,"lead_time_days":0,"lines":[{"variant":"11111111-1111-4111-8111-111111111111","sku":"SKU-A","quantity":10000,"unit_price_irr":900000000000001,"total_irr":9000000000000010000,"from_ready":10000,"from_production":0,"lead_time_days":0}]}';
it("preserves exact signed-bigint IRR tokens and rejects fractional or inconsistent money", () => {
  const valid = body.replaceAll("900000000000001", "900000000000010");
  expect(parseQuoteResponse(valid).goods_total_irr).toBe("9000000000000100000");
  expect(() => parseQuoteResponse(body)).toThrow();
  expect(() =>
    parseQuoteResponse(
      valid.replace(
        '"goods_total_irr":9000000000000100000',
        '"goods_total_irr":9000000000000100010',
      ),
    ),
  ).toThrow();
  expect(() =>
    parseQuoteResponse(valid.replace('"unit_price_irr":900000000000010', '"unit_price_irr":9e14')),
  ).toThrow();
});
it("rejects mixed sales methods and fractional quantities at the BFF input boundary", () => {
  expect(
    quoteInputSchema.safeParse({
      method: "fixed_pack",
      pack_code: "pair",
      pack_count: 1,
      items: [],
    }).success,
  ).toBe(false);
  expect(
    quoteInputSchema.safeParse({ method: "fixed_pack", pack_code: "pair", pack_count: 1.5 })
      .success,
  ).toBe(false);
});
it("returns validation issues for malformed monetary strings without throwing from BigInt", () => {
  const quote = parseQuoteResponse(body.replaceAll("900000000000001", "900000000000010"));
  for (const value of ["bad", "1e5", "1.5", "", "-100", "01", "10000000000000000000"]) {
    expect(quoteSchema.safeParse({ ...quote, goods_total_irr: value }).success).toBe(false);
    for (const field of ["unit_price_irr", "total_irr"]) {
      expect(
        quoteSchema.safeParse({
          ...quote,
          lines: [{ ...quote.lines[0], [field]: value }],
        }).success,
      ).toBe(false);
    }
  }
});

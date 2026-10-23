import { describe, expect, it } from "vitest";
import { formatToman, tomanToIrr } from "./money";

describe("catalog money presentation", () => {
  it("converts IRR to toman exactly", () => {
    expect(formatToman(1_250_000, "en")).toBe("125,000");
    expect(formatToman("9000000000000100000", "en")).toBe("900,000,000,000,010,000");
  });
  it("accepts integer toman and rejects rounding or overflow at entry", () => {
    expect(tomanToIrr(125_000)).toBe(1_250_000);
    expect(tomanToIrr(100_000_000_000_000)).toBe(1_000_000_000_000_000);
    for (const value of [1.25, 0, -1, NaN, Infinity, 100_000_000_000_001])
      expect(() => tomanToIrr(value)).toThrow("invalid_toman_amount");
  });

  it.each([1_250_001, 0, 1.5])(
    "rejects an amount that cannot cross the UI boundary: %s",
    (value) => {
      expect(() => formatToman(value, "en")).toThrow("invalid_irr_amount");
    },
  );
});

import { describe, expect, it } from "vitest";
import { formatToman } from "./money";

describe("catalog money presentation", () => {
  it("converts IRR to toman exactly", () => {
    expect(formatToman(1_250_000, "en")).toBe("125,000");
  });

  it.each([1_250_001, 0, 1.5])(
    "rejects an amount that cannot cross the UI boundary: %s",
    (value) => {
      expect(() => formatToman(value, "en")).toThrow("invalid_irr_amount");
    },
  );
});

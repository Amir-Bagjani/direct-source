import { expect, it } from "vitest";
import { ApiError } from "@/shared/api/unwrap";
import { hasFieldError } from "./product-editor.validation";

it("locates business-rule paths and serializer fields without rendering server copy", () => {
  const path = "tiers.1.unit_price_irr";
  expect(
    hasFieldError(new ApiError(400, "invalid", undefined, { [path]: "private error" }), path),
  ).toBe(true);
  expect(
    hasFieldError(
      new ApiError(400, "invalid", undefined, { tiers: [{}, { unit_price_irr: ["invalid"] }] }),
      path,
    ),
  ).toBe(true);
  for (const fields of [undefined, null, "invalid", {}, { tiers: [{}, { unit_price_irr: [] }] }])
    expect(hasFieldError(new ApiError(400, "invalid", undefined, fields), path)).toBe(false);
  expect(hasFieldError(new ApiError(403, "denied", undefined, { [path]: "invalid" }), path)).toBe(
    false,
  );
  expect(hasFieldError(new Error("offline"), path)).toBe(false);
  expect(hasFieldError(new ApiError(400, "invalid", undefined, {}), "__proto__.constructor")).toBe(
    false,
  );
});

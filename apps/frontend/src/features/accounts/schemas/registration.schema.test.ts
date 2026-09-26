import { expect, it } from "vitest";
import { registrationSchema } from "./registration.schema";
import { normalizeMobile } from "../utils/normalize-mobile";

it.each(["09123456789", "۰۹۱۲۳۴۵۶۷۸۹", "٠٩١٢٣٤٥٦٧٨٩", " +989123456789 "])(
  "normalizes mobile %s exactly like Django",
  (mobile) => {
    expect(normalizeMobile(mobile)).toBe("+989123456789");
  },
);

const valid = {
  first_name: "Test",
  last_name: "Account",
  mobile: "09123456789",
  password: " Test-password! ",
  accept_terms: true,
};

it("preserves password whitespace, trims names, defaults optional email and strips privilege fields", () => {
  expect(registrationSchema.parse({ ...valid, first_name: " Test ", role: "owner" })).toEqual({
    ...valid,
    mobile: "+989123456789",
    email: "",
  });
});

it.each([
  { mobile: "1234" },
  { mobile: "+981234567890" },
  { password: "short" },
  { password: "x".repeat(129) },
  { first_name: " " },
  { last_name: "x".repeat(151) },
  { email: "invalid" },
  { accept_terms: false },
])("rejects invalid registration input %#", (change) => {
  expect(registrationSchema.safeParse({ ...valid, ...change }).success).toBe(false);
});

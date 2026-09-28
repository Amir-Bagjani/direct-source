import { expect, it } from "vitest";
import { businessInputSchema } from "./business.schema";
const input = {
  name: " Business ",
  kind: "manufacturer",
  phone: "۰۲۱۱۲۳۴۵۶۷۸",
  description: " Activity ",
  address: { province: "Tehran", city: "Tehran", address: "Private address" },
};
it("normalizes phone digits and strips client-supplied ownership and permissions", () => {
  const data = businessInputSchema.parse({
    ...input,
    owner: "other",
    status: "verified",
    controlled_access: true,
  });
  expect(data).toEqual({
    ...input,
    name: "Business",
    phone: "02112345678",
    description: "Activity",
  });
});
it.each([
  { kind: "both" },
  { name: " " },
  { phone: "123" },
  { description: "x".repeat(2001) },
  { address: { province: "", city: "Tehran", address: "Address" } },
])("rejects incomplete or invalid business input %#", (changes) => {
  expect(businessInputSchema.safeParse({ ...input, ...changes }).success).toBe(false);
});

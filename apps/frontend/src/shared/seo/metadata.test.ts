import { expect, it } from "vitest";
import { canonicalUrl, localeAlternates } from "./metadata";

it("removes modal/filter parameters and keeps locale in canonical URLs", () => {
  expect(canonicalUrl("/en?modal=about")).toBe("http://localhost:3000/en");
  expect(localeAlternates("/catalog/123").fa).toBe("http://localhost:3000/fa/catalog/123");
  expect(() => canonicalUrl("https://attacker.test")).toThrow();
});

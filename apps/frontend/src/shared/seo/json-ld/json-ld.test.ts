import { expect, it } from "vitest";
import { serializeJsonLd } from "./json-ld";

it("escapes script terminators in JSON-LD", () => {
  expect(serializeJsonLd({ name: "</script><script>alert(1)</script>" })).not.toContain("<");
});

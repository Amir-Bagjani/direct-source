import { expect, it } from "vitest";
import { isSameOriginMutation } from "./request-policy";

it.each(["GET", "HEAD", "OPTIONS"])("allows the safe %s method without an Origin", (method) => {
  expect(isSameOriginMutation(new Request("https://market.test/api", { method }), "invalid")).toBe(
    true,
  );
});

it("rejects missing and cross-origin mutation origins", () => {
  for (const origin of ["", "https://attacker.test"]) {
    expect(
      isSameOriginMutation(
        new Request("https://market.test/api", { method: "POST", headers: { origin } }),
        "https://market.test",
      ),
    ).toBe(false);
  }
  expect(
    isSameOriginMutation(
      new Request("https://market.test/api", {
        method: "POST",
        headers: { origin: "https://market.test" },
      }),
      "https://market.test",
    ),
  ).toBe(true);
});

it("rejects a cross-site mutation even when its Origin matches", () => {
  expect(
    isSameOriginMutation(
      new Request("https://market.test/api", {
        method: "POST",
        headers: { origin: "https://market.test", "sec-fetch-site": "cross-site" },
      }),
      "https://market.test",
    ),
  ).toBe(false);
});

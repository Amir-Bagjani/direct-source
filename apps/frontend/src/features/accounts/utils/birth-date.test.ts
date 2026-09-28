import { expect, it } from "vitest";
import { fromJalaliBirthDate, toJalaliBirthDate } from "./birth-date";
it("converts Nowruz, Persian digits and the leap day without timezone drift", () => {
  expect(fromJalaliBirthDate("۱۴۰۳/۰۱/۰۱")).toBe("2024-03-20");
  expect(fromJalaliBirthDate("1399/12/30")).toBe("2021-03-20");
  expect(toJalaliBirthDate("2021-03-20")).toBe("1399/12/30");
  expect(() => fromJalaliBirthDate("1400/12/30")).toThrow();
  expect(() => fromJalaliBirthDate("1400/13/01")).toThrow();
});

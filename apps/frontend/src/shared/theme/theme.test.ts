import { expect, it } from "vitest";
import { DEFAULT_THEME, parseTheme } from "./theme";

it.each([
  ["light", "light"],
  ["dark", "dark"],
  [null, DEFAULT_THEME],
  ["system", DEFAULT_THEME],
  ["DARK", DEFAULT_THEME],
  [{}, DEFAULT_THEME],
] as const)("parses %j as %s", (input, expected) => {
  expect(parseTheme(input)).toBe(expected);
});

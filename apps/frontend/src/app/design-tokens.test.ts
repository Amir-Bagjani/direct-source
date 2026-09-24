import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("provides complete, non-cyclic shadcn theme mappings for both themes", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  const mappings = [...css.matchAll(/--color-[\w-]+: var\((--[\w-]+)\);/g)].map(
    (match) => match[1]!,
  );
  const light = /:root\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
  const dark = /html\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
  expect(mappings).toContain("--background");
  expect(mappings).toContain("--sidebar-ring");
  for (const block of [light, dark]) {
    for (const token of mappings) {
      expect(block).toContain(`${token}: oklch(`);
    }
  }
  expect(light).toContain("color-scheme: light");
  expect(dark).toContain("color-scheme: dark");
  expect(css).not.toContain("prefers-color-scheme");
});

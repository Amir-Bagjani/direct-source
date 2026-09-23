import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

function normalize(value: string) {
  return value
    .replace(/rgba\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\)/g, "rgb($1 $2 $3 / $4)")
    .replace(/\b0px\b/g, "0")
    .replaceAll("'", '"')
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(source: string) {
  const result = new Map<string, string>();
  for (const match of source.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    const name = match[1];
    const value = match[2];
    if (name && value !== undefined) result.set(name, normalize(value));
  }
  return result;
}

function themeTokens(source: string, theme: "light" | "dark") {
  const selector =
    theme === "light"
      ? /:root,\s*html\[data-theme="light"\]\s*\{([\s\S]*?)\n\}/u
      : /html\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/u;
  return tokens(selector.exec(source)?.[1] ?? "");
}

function resolveColor(name: string, theme: Map<string, string>, primitives: Map<string, string>) {
  let value = theme.get(name) ?? primitives.get(name);
  for (let depth = 0; value?.startsWith("var(") && depth < 3; depth += 1) {
    const reference = /var\((--[\w-]+)\)/u.exec(value)?.[1];
    value = reference ? (theme.get(reference) ?? primitives.get(reference)) : undefined;
  }
  if (!value || !/^#[\da-f]{6}$/iu.test(value)) throw new Error(`Unresolved color token: ${name}`);
  return value;
}

function contrastRatio(first: string, second: string) {
  const luminance = (hex: string) => {
    const channels = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((value) => {
      const channel = Number.parseInt(value, 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
  };
  const one = luminance(first);
  const two = luminance(second);
  return (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
}

it("keeps every documented primitive token and exact value in runtime CSS", () => {
  const design = readFileSync("../../docs/frontend/design.md", "utf8");
  const referenceBlock = design.match(/```css\s+@theme\s*{([\s\S]*?)}\s*```/)?.[1];
  expect(referenceBlock).toBeDefined();
  const reference = tokens(referenceBlock ?? "");
  const runtime = tokens(readFileSync("src/app/globals.css", "utf8"));
  expect(reference.size).toBeGreaterThan(0);
  for (const [name, value] of reference) expect(runtime.get(name)).toBe(value);
});

it("defines one semantic contract with accessible core pairs for both themes", () => {
  const source = readFileSync("src/app/globals.css", "utf8");
  const primitives = tokens(source.match(/:root\s*\{([\s\S]*?)\n\}/u)?.[1] ?? "");
  const light = themeTokens(source, "light");
  const dark = themeTokens(source, "dark");
  expect([...light.keys()].sort()).toEqual([...dark.keys()].sort());

  for (const theme of [light, dark]) {
    const ratio = (foreground: string, background: string) =>
      contrastRatio(
        resolveColor(foreground, theme, primitives),
        resolveColor(background, theme, primitives),
      );
    expect(ratio("--color-text-primary", "--color-background")).toBeGreaterThanOrEqual(4.5);
    expect(ratio("--color-text-secondary", "--color-background")).toBeGreaterThanOrEqual(4.5);
    expect(ratio("--color-action-primary-text", "--color-action-primary")).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(ratio("--color-input-border", "--color-input-background")).toBeGreaterThanOrEqual(3);
    expect(ratio("--color-focus-ring", "--color-background")).toBeGreaterThanOrEqual(3);
  }
});

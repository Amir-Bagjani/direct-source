import { expect, it } from "vitest";
import fa from "../../messages/fa.json";
import en from "../../messages/en.json";

function messages(value: unknown, prefix = ""): Array<[string, unknown]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [[prefix, value]];
  return Object.entries(value).flatMap(([key, item]) =>
    messages(item, prefix ? `${prefix}.${key}` : key),
  );
}

it("keeps locale catalogs complete and every message usable", () => {
  const faMessages = messages(fa).sort(([first], [second]) => first.localeCompare(second));
  const enMessages = messages(en).sort(([first], [second]) => first.localeCompare(second));
  expect(faMessages.map(([key]) => key)).toEqual(enMessages.map(([key]) => key));
  for (const [key, value] of [...faMessages, ...enMessages]) {
    expect(typeof value, key).toBe("string");
    expect((value as string).trim().length, key).toBeGreaterThan(0);
  }
});

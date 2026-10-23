export function attributeValueText(value: unknown, locale: string): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return new Intl.NumberFormat(locale).format(value);
  if (typeof value === "boolean") return value ? "✓" : "—";
  if (Array.isArray(value)) return value.map((item) => attributeValueText(item, locale)).join("، ");
  return value && typeof value === "object" ? JSON.stringify(value) : "—";
}

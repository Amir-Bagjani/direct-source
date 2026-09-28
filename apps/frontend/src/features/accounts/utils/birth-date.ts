import { normalizeDigits } from "./normalize-digits";
const calendar = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", {
  timeZone: "UTC",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export function toJalaliBirthDate(iso: string) {
  const parts = calendar.formatToParts(new Date(`${iso}T12:00:00Z`));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}/${part("month")}/${part("day")}`;
}
export function fromJalaliBirthDate(value: string) {
  const normalized = normalizeDigits(value.trim());
  if (!/^\d{4}\/\d{2}\/\d{2}$/.test(normalized)) throw new Error("invalid_birth_date");
  const year = Number(normalized.slice(0, 4));
  let low = Math.floor(Date.UTC(year + 621, 0, 1) / 86400000),
    high = Math.floor(Date.UTC(year + 623, 0, 1) / 86400000);
  // Intl owns calendar rules; binary search the two Gregorian years containing this Jalali year.
  while (low <= high) {
    const day = Math.floor((low + high) / 2);
    const iso = new Date(day * 86400000).toISOString().slice(0, 10);
    const local = toJalaliBirthDate(iso);
    if (local === normalized) return iso;
    if (local < normalized) low = day + 1;
    else high = day - 1;
  }
  throw new Error("invalid_birth_date");
}

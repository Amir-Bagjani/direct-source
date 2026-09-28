import { normalizeDigits } from "./normalize-digits";
export function normalizeMobile(value: string) {
  const digits = normalizeDigits(value.trim());
  return digits.startsWith("09") ? `+98${digits.slice(1)}` : digits;
}

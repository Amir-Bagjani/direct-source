export function normalizeMobile(value: string) {
  const digits = value
    .trim()
    .replace(/[۰-۹٠-٩]/gu, (digit) => String(digit.charCodeAt(0) - (digit >= "۰" ? 1776 : 1632)));
  return digits.startsWith("09") ? `+98${digits.slice(1)}` : digits;
}

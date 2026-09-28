export function normalizeDigits(value: string) {
  return value.replace(/[۰-۹٠-٩]/gu, (digit) =>
    String(digit.charCodeAt(0) - (digit >= "۰" ? 1776 : 1632)),
  );
}

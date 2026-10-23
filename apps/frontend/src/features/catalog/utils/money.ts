export function formatToman(valueIrr: number | string, locale: string) {
  if (typeof valueIrr === "number" && !Number.isSafeInteger(valueIrr))
    throw new Error("invalid_irr_amount");
  if (typeof valueIrr === "string" && !/^[1-9]\d{0,18}$/.test(valueIrr))
    throw new Error("invalid_irr_amount");
  const irr = BigInt(valueIrr);
  if (irr <= 0n || irr % 10n !== 0n || irr > 9223372036854775807n)
    throw new Error("invalid_irr_amount");
  return new Intl.NumberFormat(locale).format(irr / 10n);
}

export function tomanToIrr(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 100_000_000_000_000)
    throw new Error("invalid_toman_amount");
  return value * 10;
}

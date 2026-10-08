export function formatToman(valueIrr: number, locale: string) {
  if (!Number.isSafeInteger(valueIrr) || valueIrr <= 0 || valueIrr % 10 !== 0)
    throw new Error("invalid_irr_amount");
  return new Intl.NumberFormat(locale).format(valueIrr / 10);
}

// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, it } from "vitest";
import en from "../../../../../messages/en.json";
import fa from "../../../../../messages/fa.json";
import { PriceTable } from "./price-table";

afterEach(cleanup);
for (const [locale, messages] of [
  ["en", en],
  ["fa", fa],
] as const) {
  it(`shows server-validated effective prices, tier bounds and explicit missing cells in ${locale}`, () => {
    render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <PriceTable
          caption="Saved prices"
          variants={[
            { id: "white", sku: "SKU-W" },
            { id: "brown", sku: "SKU-B" },
            { id: "missing", sku: "SKU-M" },
          ]}
          tiers={[
            {
              min_quantity: 1,
              max_quantity: 9,
              unit_price_irr: 10000,
              overrides: [{ variant: "brown", unit_price_irr: 12000 }],
              effective_prices: [
                { variant: "white", unit_price_irr: 10000 },
                { variant: "brown", unit_price_irr: 12000 },
              ],
            },
            {
              min_quantity: 10,
              max_quantity: null,
              unit_price_irr: 8000,
              overrides: [],
              effective_prices: [
                { variant: "white", unit_price_irr: 8000 },
                { variant: "brown", unit_price_irr: 8000 },
              ],
            },
          ]}
        />
      </NextIntlClientProvider>,
    );
    const rows = within(screen.getByRole("table", { name: "Saved prices" })).getAllByRole("row");
    const number = new Intl.NumberFormat(locale);
    expect(rows[0]?.textContent).toContain("SKU-W");
    expect(rows[0]?.textContent).toContain("SKU-B");
    expect(rows[1]?.textContent).toContain(number.format(1200));
    expect(rows[1]?.textContent).toContain(
      messages.catalog.wholesale.closedRange
        .replace("{min}", number.format(1))
        .replace("{max}", number.format(9)),
    );
    expect(rows[1]?.textContent).toContain(messages.catalog.priceUnavailable);
    expect(rows[2]?.textContent).toContain(number.format(800));
    expect(rows[2]?.textContent).toContain(
      messages.catalog.wholesale.openRange.replace("{min}", number.format(10)),
    );
    expect(rows[2]?.textContent).not.toContain(number.format(1200));
    expect(rows).toHaveLength(3);
  });
}

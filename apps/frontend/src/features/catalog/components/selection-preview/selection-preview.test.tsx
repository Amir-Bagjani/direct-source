// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, it, vi } from "vitest";
import en from "../../../../../messages/en.json";
import { ApiError } from "@/shared/api/unwrap";
import type { Quote } from "../../schemas/catalog-quote.schema";
import { SelectionPreview } from "./selection-preview";

afterEach(cleanup);
const variant = "11111111-1111-4111-8111-111111111111";
const result: Quote = {
  currency: "IRR",
  quantity: 4,
  tier_min_quantity: 2,
  goods_total_irr: "4000",
  lead_time_days: 7,
  lines: [
    {
      variant,
      sku: "SKU-A",
      quantity: 4,
      unit_price_irr: "1000",
      total_irr: "4000",
      from_ready: 3,
      from_production: 1,
      lead_time_days: 7,
    },
  ],
};
function view(quote: (id: string, input: unknown) => Promise<Quote>) {
  const client = new QueryClient();
  const content = (price: number) => (
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={en}>
        <SelectionPreview
          scope="retailer"
          productId="product"
          plan={{
            free_mix_min: 2,
            tiers: [
              {
                min_quantity: 2,
                max_quantity: null,
                unit_price_irr: price,
                overrides: [],
                effective_prices: [{ variant, unit_price_irr: price }],
              },
            ],
            packs: [{ code: "pair", name: "Pair", items: [{ variant, quantity: 2 }] }],
          }}
          variants={[
            {
              id: variant,
              sku: "SKU-A",
              orderable: true,
              supply: { mode: "hybrid", ready_stock: 3, production_cap: 10, lead_time_days: 7 },
            },
            {
              id: "22222222-2222-4222-8222-222222222222",
              sku: "SKU-ZERO",
              orderable: false,
              supply: null,
            },
          ]}
          quote={quote}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  const rendered = render(content(1000));
  return { ...rendered, updatePrice: (price: number) => rendered.rerender(content(price)) };
}
it("enforces minimum, disables unavailable SKUs, locks pending input and removes stale results after an edit", async () => {
  let finish: (quote: Quote) => void = () => {
    throw new Error("Not started");
  };
  const quote = vi.fn(
    () =>
      new Promise<Quote>((resolve) => {
        finish = resolve;
      }),
  );
  view(quote);
  const button = screen.getByRole("button", { name: en.catalog.selection.calculate });
  const input = screen.getByLabelText("Quantity for SKU-A");
  expect(screen.getByLabelText("Quantity for SKU-ZERO").hasAttribute("disabled")).toBe(true);
  fireEvent.change(input, { target: { value: "1" } });
  expect(button.hasAttribute("disabled")).toBe(true);
  fireEvent.change(input, { target: { value: "4" } });
  fireEvent.click(button);
  await waitFor(() =>
    expect(quote).toHaveBeenCalledWith("product", {
      method: "free_mix",
      items: [{ variant, quantity: 4 }],
    }),
  );
  expect(input.hasAttribute("disabled")).toBe(true);
  await act(async () => finish(result));
  await screen.findByRole("status");
  expect(screen.getAllByText("400 toman").length).toBeGreaterThan(0);
  expect(screen.getByText("7 days of production")).toBeDefined();
  fireEvent.change(input, { target: { value: "5" } });
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.queryByText("7 days of production")).toBeNull();
  expect(quote).toHaveBeenCalledTimes(1);
});
it("sends whole pack counts without free-mix items and retains the form after a supply conflict", async () => {
  const quote = vi.fn().mockRejectedValue(new ApiError(409, "supply_changed"));
  view(quote);
  fireEvent.click(screen.getByRole("button", { name: en.catalog.method.fixed_pack }));
  fireEvent.change(screen.getByLabelText(en.catalog.selection.packCount), {
    target: { value: "2" },
  });
  fireEvent.click(screen.getByRole("button", { name: en.catalog.selection.calculate }));
  await waitFor(() =>
    expect(quote).toHaveBeenCalledWith("product", {
      method: "fixed_pack",
      pack_code: "pair",
      pack_count: 2,
    }),
  );
  await screen.findByText(en.catalog.selection.supplyError);
  expect(screen.getByLabelText(en.catalog.selection.packCount).getAttribute("value")).toBe("2");
});

it("hides an estimate after saved prices change while preserving the selection draft", async () => {
  const { updatePrice } = view(vi.fn().mockResolvedValue(result));
  fireEvent.change(screen.getByLabelText("Quantity for SKU-A"), { target: { value: "4" } });
  fireEvent.click(screen.getByRole("button", { name: en.catalog.selection.calculate }));
  await screen.findByRole("status");
  updatePrice(2000);
  await screen.findByText(en.catalog.selection.changed);
  expect(screen.queryByText("7 days of production")).toBeNull();
  expect(screen.getByLabelText("Quantity for SKU-A").getAttribute("value")).toBe("4");
});

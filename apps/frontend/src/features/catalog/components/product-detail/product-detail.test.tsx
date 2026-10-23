// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, it, vi } from "vitest";
import en from "../../../../../messages/en.json";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProductDetail } from "./product-detail";

const state = vi.hoisted(() => ({ allowed: true, success: true }));
vi.mock("../product-reviews/product-reviews", () => ({ ProductReviews: () => null }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, ...props }: ComponentProps<"a">) => <a {...props}>{children}</a>,
}));
vi.mock("@tanstack/react-query", async (original) => ({
  ...(await original<object>()),
  useSuspenseQuery: () => ({ data: product }),
  useQuery: (options: { queryKey: readonly unknown[] }) =>
    options.queryKey.includes("access")
      ? {
          isSuccess: state.success,
          isPending: false,
          data: { allowed: state.allowed, scope: "business" },
        }
      : { isSuccess: true, data: priced },
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
afterEach(() => {
  cleanup();
  state.allowed = true;
  state.success = true;
});
const product = {
  id: "product",
  name: "Shoe",
  brand: "",
  description: "Leather shoe",
  manufacturer_model: "",
  attributes: {},
  display_attributes: [],
  image_urls: [],
  category_path: [],
  variants: [],
  shipping_services: [],
  rating: { average: null, count: 0 },
  manufacturer: {
    id: "maker",
    name: "Manufacturer",
    verified: true,
    logo_url: null,
    description: "Maker",
    province: null,
    city: null,
  },
};
const priced = {
  ...product,
  representative_price_irr: 1_250_000,
  wholesale: {
    free_mix_min: 1,
    packs: [],
    tiers: [
      { min_quantity: 1, max_quantity: null, unit_price_irr: 1_250_000, effective_prices: [] },
    ],
  },
};
function view() {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Tehran">
        <ProductDetail id="product" />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}
it("removes a cached detail price when live access fails or is revoked", () => {
  const { rerender, container } = render(view());
  expect(screen.getByText("From 125,000 toman")).toBeDefined();
  state.success = false;
  rerender(view());
  expect(container.textContent).not.toContain("125,000");
  expect(screen.getByText(en.catalog.priceProtected)).toBeDefined();
  state.success = true;
  state.allowed = false;
  rerender(view());
  expect(container.textContent).not.toContain("125,000");
  expect(screen.queryByText(en.catalog.wholesale.caption)).toBeNull();
});

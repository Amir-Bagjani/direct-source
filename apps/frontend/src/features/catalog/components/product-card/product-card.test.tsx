// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, it, vi } from "vitest";
import en from "../../../../../messages/en.json";
import type { PublicProduct } from "../../schemas/public-catalog.schema";
import { ProductCard } from "./product-card";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, ...props }: ComponentProps<"a">) => <a {...props}>{children}</a>,
}));
afterEach(cleanup);
const product: PublicProduct = {
  id: "8d29dde8-cb2e-48eb-9f5a-0f401e800f2b",
  business: "bba784d0-752e-453b-b011-71497c636f3d",
  category: "9963686d-ab57-4b2d-963e-67b560ab3980",
  name: "Leather shoe",
  description: "Leather",
  brand: "Aftab",
  manufacturer_model: "AF-101",
  attributes: {},
  image_urls: [],
  variants: [],
  published_at: "2026-09-28T10:00:00Z",
  category_path: [],
  manufacturer: {
    id: "bba784d0-752e-453b-b011-71497c636f3d",
    name: "Aftab Leather",
    description: "Maker",
    verified: true,
    province: null,
    city: null,
    joined_at: null,
  },
  rating: { average: null, count: 0 },
  shipping_services: [],
  orderable: true,
  lead_time_days: 0,
  supply_modes: ["hybrid"],
  sale_methods: ["free_mix", "fixed_pack"],
  minimum_order: 2,
  free_mix_min: 2,
  packs: [],
};
function card(props: ComponentProps<typeof ProductCard>) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Tehran">
      <ProductCard {...props} />
    </NextIntlClientProvider>,
  );
}
it("shows wholesale decision facts, truthful verification and unrated/no-image fallbacks", () => {
  card({ product });
  for (const text of [
    "Hybrid supply",
    "Free mix, Fixed pack",
    "2 units",
    "Ready to ship",
    en.catalog.card.noRating,
    en.catalog.imageFallback,
    en.catalog.card.verified,
  ])
    expect(screen.getByText(text)).toBeDefined();
  expect(screen.getByRole("link", { name: en.catalog.card.view }).getAttribute("href")).toBe(
    `/catalog/${product.id}`,
  );
  expect(screen.queryByRole("button")).toBeNull();
});
it("never renders a supplied private amount without the explicit wholesale display decision", () => {
  const { container } = card({ product, representativePriceIrr: 1_250_000 });
  expect(container.textContent).not.toContain("125,000");
  expect(screen.getByText(en.catalog.priceProtected)).toBeDefined();
});
it("explains authorized unit prices and keeps unresolved permission neutral", () => {
  const { rerender } = card({ product, showWholesale: true, representativePriceIrr: 1_250_000 });
  expect(screen.getByText("From 125,000 toman")).toBeDefined();
  expect(screen.getByText(en.catalog.card.unitPrice)).toBeDefined();
  rerender(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Tehran">
      <ProductCard product={product} showWholesale />
    </NextIntlClientProvider>,
  );
  expect(screen.getByText(en.catalog.priceUnavailable)).toBeDefined();
  expect(screen.queryByText(en.catalog.priceProtected)).toBeNull();
  rerender(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Tehran">
      <ProductCard product={product} pricePending />
    </NextIntlClientProvider>,
  );
  expect(screen.getByRole("status", { name: en.catalog.wholesale.loading })).toBeDefined();
  expect(screen.queryByText(en.catalog.priceProtected)).toBeNull();
});
it("does not invent a zero minimum, a preparation promise or verification for absent data", () => {
  card({
    product: {
      ...product,
      minimum_order: null,
      lead_time_days: null,
      orderable: false,
      manufacturer: { ...product.manufacturer, verified: false },
      rating: { average: 4.5, count: 3 },
    },
  });
  expect(screen.getByText(en.catalog.card.inDetails)).toBeDefined();
  expect(screen.getByText(en.catalog.leadUnavailable)).toBeDefined();
  expect(screen.getByText(en.catalog.notOrderable)).toBeDefined();
  expect(screen.queryByText(en.catalog.card.verified)).toBeNull();
  expect(screen.getByText("Rated 4.5 of 5 · 3 reviews")).toBeDefined();
});

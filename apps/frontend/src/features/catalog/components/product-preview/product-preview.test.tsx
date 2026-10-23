// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, it, vi } from "vitest";
import en from "../../../../../messages/en.json";
import fa from "../../../../../messages/fa.json";
import type { ProductPreview as Preview } from "../../schemas/public-catalog.schema";
import { ProductPreview } from "./product-preview";

const api = vi.hoisted(() => ({ preview: vi.fn() }));
vi.mock("../../api/catalog-management.api", async (original) => ({
  ...(await original<typeof import("../../api/catalog-management.api")>()),
  readProductPreview: api.preview,
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const id = "11111111-1111-4111-8111-111111111111";
const product: Preview = {
  id,
  business: id,
  category: id,
  name: "Saved leather shoe",
  description: "Saved description",
  brand: "",
  manufacturer_model: "",
  attributes: {},
  display_attributes: [],
  image_urls: [],
  published_at: null,
  category_path: [],
  manufacturer: {
    id,
    name: "Maker",
    description: "",
    verified: true,
    province: null,
    city: null,
    joined_at: null,
    logo_url: null,
  },
  rating: { average: null, count: 0 },
  shipping_services: [],
  orderable: true,
  lead_time_days: 7,
  supply_modes: ["hybrid"],
  sale_methods: ["free_mix"],
  minimum_order: 2,
  free_mix_min: 2,
  packs: [],
  representative_price_irr: 1000,
  variants: [
    {
      id,
      sku: "SKU-42",
      attributes: {},
      display_attributes: [],
      image_urls: ["https://images.test/variant-front.png", "https://images.test/variant-back.png"],
      orderable: true,
      supply: { mode: "hybrid", ready_stock: 3, production_cap: 10, lead_time_days: 7 },
    },
  ],
  wholesale: {
    currency: "IRR",
    free_mix_min: 2,
    packs: [],
    tiers: [
      {
        min_quantity: 2,
        max_quantity: null,
        unit_price_irr: 1000,
        overrides: [],
        effective_prices: [{ variant: id, unit_price_irr: 1200 }],
      },
    ],
  },
};
function view() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const content = (enabled: boolean) => (
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={en}>
        <ProductPreview id={id} scope="maker" enabled={enabled} />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  const result = render(content(true));
  return { ...result, disable: () => result.rerender(content(false)), client };
}
it("defaults to a price-free public preview and shows server effective prices only in retailer mode", async () => {
  api.preview.mockResolvedValue(product);
  const { client } = view();
  await screen.findByRole("heading", { name: product.name });
  expect(screen.getByText(en.catalog.priceProtected)).toBeDefined();
  expect(screen.queryByText("100 toman")).toBeNull();
  expect(screen.queryByText("120 toman")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: en.catalogManagement.preview.retailer }));
  expect(screen.getByText("100 toman")).toBeDefined();
  expect(screen.getByText("120 toman")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: en.catalogManagement.preview.public }));
  expect(screen.queryByText("120 toman")).toBeNull();
  client.clear();
});
it("exposes all variant images and immediately removes cached private content when disabled", async () => {
  api.preview.mockResolvedValue(product);
  const { disable, client } = view();
  const trigger = await screen.findByRole("button", { name: "View images for SKU-42" });
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(trigger);
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: en.catalog.gallery.next }));
  const gallery = screen
    .getAllByRole("region", { name: en.catalog.gallery.title })
    .find((region) => within(region).queryByRole("img", { name: "SKU-42" }));
  if (!gallery) throw new Error("Variant gallery is missing");
  expect(within(gallery).getByRole("img", { name: "SKU-42" }).getAttribute("src")).toBe(
    "https://images.test/variant-back.png",
  );
  disable();
  expect(screen.queryByRole("heading", { name: product.name })).toBeNull();
  expect(screen.queryByRole("img", { name: "SKU-42" })).toBeNull();
  client.clear();
});
it("offers retry after a private preview failure", async () => {
  api.preview.mockRejectedValueOnce(new Error("Unavailable")).mockResolvedValue(product);
  const { client } = view();
  await screen.findByText(en.catalogManagement.preview.unavailable);
  fireEvent.click(screen.getByRole("button", { name: en.common.retry }));
  await screen.findByRole("heading", { name: product.name });
  expect(api.preview).toHaveBeenCalledTimes(2);
  client.clear();
});

it("formats the free-mix minimum with Persian digits through the shared catalog message", async () => {
  api.preview.mockResolvedValue(product);
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="fa" messages={fa}>
        <ProductPreview scope="maker" id={id} enabled />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  await screen.findByText("حداقل تعداد ترکیب آزاد: ۲");
  client.clear();
});

// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, it, vi } from "vitest";
import en from "../../../../../messages/en.json";
import { ManufacturerProfile } from "./manufacturer-profile";
import { parseCatalogSearchParams } from "../../utils/catalog-search";

const manufacturer = {
  name: "Maker",
  description: "Manufacturing",
  verified: true,
  province: null,
  city: null,
  joined_at: null,
  product_count: 0,
  categories: [],
  logo_url: null as string | null,
  rating: { average: null as number | null, count: 0 },
};
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, ...props }: ComponentProps<"a">) => <a {...props}>{children}</a>,
}));
vi.mock("@tanstack/react-query", () => ({
  queryOptions: (options: unknown) => options,
  useSuspenseQuery: (options: { queryKey: readonly unknown[] }) => ({
    data: options.queryKey.includes("manufacturer") ? manufacturer : { results: [] },
  }),
}));
afterEach(() => {
  cleanup();
  manufacturer.logo_url = null;
  manufacturer.rating = { average: null, count: 0 };
});
function view() {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Tehran">
      <ManufacturerProfile id="maker" filters={parseCatalogSearchParams({})} />
    </NextIntlClientProvider>,
  );
}
it("shows the unrated state without inventing a score or logo", () => {
  view();
  expect(screen.getByText(en.catalog.card.noRating)).toBeDefined();
  expect(screen.queryByRole("img")).toBeNull();
});
it("renders the approved logo and published collaboration rating", () => {
  manufacturer.logo_url = "https://images.test/logo.png";
  manufacturer.rating = { average: 4.5, count: 2 };
  view();
  expect(screen.getByRole("img", { name: "Maker" }).getAttribute("src")).toBe(
    manufacturer.logo_url,
  );
  expect(screen.queryByText(en.catalog.card.noRating)).toBeNull();
  expect(screen.getByText(/4\.5/)).toBeDefined();
});

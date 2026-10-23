// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, it } from "vitest";
import en from "../../../../../messages/en.json";
import { CatalogFiltersForm } from "./catalog-filters-form";
import { parseCatalogSearchParams } from "../../utils/catalog-search";
import type { PublicDiscovery } from "../../schemas/public-catalog.schema";

afterEach(cleanup);
const category = "11111111-1111-4111-8111-111111111111";
const manufacturer = "22222222-2222-4222-8222-222222222222";
const attribute = "33333333-3333-4333-8333-333333333333";
const unavailable = "44444444-4444-4444-8444-444444444444";
const discovery: PublicDiscovery = {
  categories: [
    {
      id: category,
      name: "Shoes",
      slug: "shoes",
      path: [{ id: category, name: "Shoes", slug: "shoes" }],
      parent: null,
      description: "",
      position: 0,
      is_active: true,
    },
  ],
  manufacturers: [{ id: manufacturer, name: "Maker" }],
  attributes: [
    {
      id: attribute,
      category,
      name: "Color",
      code: "color",
      kind: "choice",
      scope: "variant",
      unit: "",
      description: "",
      position: 0,
      is_active: true,
      required: true,
      filterable: true,
      options: [
        { id: "red", attribute, code: "red", label: "Red", is_active: true, position: 0 },
        { id: "blue", attribute, code: "blue", label: "Blue", is_active: true, position: 1 },
      ],
    },
  ],
};
it("submits OR selections and retains unavailable URL selections until explicitly cleared", () => {
  let submitted: FormData | undefined;
  const filters = parseCatalogSearchParams({
    category: [category, unavailable],
    manufacturer,
    [`attr.${attribute}`]: ["red", "retired"],
    [`attr.${unavailable}`]: "old",
    rating_min: "4.5",
    q: "shoe",
  });
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <CatalogFiltersForm
        discovery={discovery}
        filters={filters}
        priceAllowed={false}
        id="filters"
        onSubmit={(event) => {
          event.preventDefault();
          submitted = new FormData(event.currentTarget);
        }}
        footer={<button type="submit">Apply</button>}
      />
    </NextIntlClientProvider>,
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "Blue" }));
  fireEvent.click(screen.getByRole("button", { name: "Apply" }));
  expect(submitted?.getAll("category")).toEqual([category, unavailable]);
  expect(submitted?.getAll("manufacturer")).toEqual([manufacturer]);
  expect(submitted?.getAll(`attr.${attribute}`)).toEqual(["red", "blue", "retired"]);
  expect(submitted?.getAll(`attr.${unavailable}`)).toEqual(["old"]);
  expect(submitted?.get("rating_min")).toBe("4.5");
  expect(submitted?.get("q")).toBe("shoe");
  expect(submitted?.has("price_min")).toBe(false);
});

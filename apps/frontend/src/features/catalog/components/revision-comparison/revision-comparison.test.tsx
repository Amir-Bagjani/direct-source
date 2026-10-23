// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, it } from "vitest";
import en from "../../../../../messages/en.json";
import fa from "../../../../../messages/fa.json";
import type { Revision, Taxonomy } from "../../schemas/catalog-management.schema";
import { RevisionComparison } from "./revision-comparison";
afterEach(cleanup);
const id = "11111111-1111-4111-8111-111111111111",
  image = "22222222-2222-4222-8222-222222222222";
const taxonomy: Taxonomy = {
  categories: [
    {
      id,
      name: "Footwear",
      slug: "footwear",
      parent: null,
      description: "",
      position: 0,
      is_active: true,
    },
  ],
  options: [],
  attributes: [
    {
      id,
      category: id,
      code: "color",
      name: "Colour",
      description: "",
      kind: "choice",
      scope: "variant",
      unit: "",
      required: true,
      filterable: true,
      position: 0,
      is_active: false,
      options: [
        { id, attribute: id, code: "black", label: "Black leather", position: 0, is_active: false },
      ],
    },
  ],
};
const profile = {
  category: id,
  name: "Approved shoe",
  description: "Original content",
  brand: "",
  manufacturer_model: "",
  attributes: { second: "B", first: "A" },
  images: [image, id],
};
const revision: Revision = {
  id,
  product: id,
  status: "pending",
  assigned_to: id,
  code: "",
  reason: "",
  created_at: "2026-10-18T00:00:00Z",
  before: {
    profile,
    variants: [
      { id, sku: "EXISTING", attributes: { color: "black" }, images: [] },
      { id: image, sku: "RETIRED", attributes: {}, images: [] },
    ],
  },
  proposed: {
    profile: {
      ...profile,
      name: "Proposed shoe",
      attributes: { first: "A", second: "B" },
      images: [id, image],
    },
    variants: [
      { id, sku: "EXISTING", attributes: { color: "black" }, images: [] },
      {
        id: "33333333-3333-4333-8333-333333333333",
        sku: "NEW",
        attributes: {},
        images: [],
        supply: { mode: "ready", ready_stock: 12, production_cap: 0, lead_time_days: 0 },
        package: { weight_g: 900, length_mm: 330, width_mm: 210, height_mm: 130, package_count: 1 },
      },
    ],
  },
};
it("compares readable fields, resolves historical managed labels and treats reordered attribute keys as unchanged", () => {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <RevisionComparison revision={revision} taxonomy={taxonomy} />
    </NextIntlClientProvider>,
  );
  const name = within(screen.getByRole("region", { name: en.catalogManagement.name }));
  expect(name.getByText("Approved shoe")).toBeDefined();
  expect(name.getByText("Proposed shoe")).toBeDefined();
  expect(name.getByText(en.catalogManagement.revisionDiff.changed)).toBeDefined();
  const attributes = within(
    screen.getByRole("region", { name: en.catalogManagement.revisionDiff.attributes }),
  );
  expect(attributes.getByText(en.catalogManagement.revisionDiff.unchanged)).toBeDefined();
  const existing = within(screen.getByRole("region", { name: "EXISTING" }));
  expect(existing.getAllByText("Black leather")).toHaveLength(2);
  expect(existing.queryByText("black", { exact: true })).toBeNull();
  expect(
    within(screen.getByRole("region", { name: "NEW" })).getByText(
      en.catalogManagement.revisionDiff.added,
    ),
  ).toBeDefined();
  expect(
    within(screen.getByRole("region", { name: "RETIRED" })).getByText(
      en.catalogManagement.revisionDiff.removed,
    ),
  ).toBeDefined();
  const images = within(screen.getByRole("region", { name: en.catalogManagement.images }));
  expect(images.getByText(en.catalogManagement.revisionDiff.changed)).toBeDefined();
  expect(images.getByRole("img", { name: "Approved shoe" }).getAttribute("src")).toBe(
    `/api/bff/accounts/onboarding/content?id=${image}`,
  );
  expect(images.getByRole("img", { name: "Proposed shoe" }).getAttribute("src")).toBe(
    `/api/bff/accounts/onboarding/content?id=${id}`,
  );
  expect(screen.queryByText("manufacturer_model", { exact: true })).toBeNull();
});
it("localizes the proposed supply and package for a new variant", () => {
  render(
    <NextIntlClientProvider locale="fa" messages={fa}>
      <RevisionComparison revision={revision} taxonomy={taxonomy} />
    </NextIntlClientProvider>,
  );
  const added = within(screen.getByRole("region", { name: "NEW" }));
  expect(added.getByText("۹۰۰")).toBeDefined();
  expect(added.getByText("۱۲")).toBeDefined();
  expect(added.getByText(fa.catalogManagement.package.weight)).toBeDefined();
});

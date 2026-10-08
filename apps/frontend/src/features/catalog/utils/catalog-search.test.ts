import { describe, expect, it } from "vitest";
import {
  catalogPageHref,
  catalogSearch,
  parseCatalogSearchParams,
  publicCatalogSearch,
  wholesaleCatalogSearch,
} from "./catalog-search";

const category = "b1f8d7b1-9143-4a85-a7c4-d52ee35640cc";

describe("catalog URL state", () => {
  it("normalizes repeated filters into a stable query and preserves them across pagination", () => {
    const filters = parseCatalogSearchParams({
      q: "  کیف چرمی  ",
      category: [category, category],
      supply: ["hybrid", "ready", "invalid"],
      method: "free_mix",
      orderable: "true",
      lead_max: "14",
      sort: "lead_time",
      page: "2",
    });
    expect(filters).toMatchObject({
      q: "کیف چرمی",
      categories: [category],
      supply: ["hybrid", "ready"],
      method: ["free_mix"],
      orderable: "true",
      leadMax: "14",
      sort: "lead_time",
      page: 2,
    });
    expect(catalogPageHref(filters, 3)).toContain("page=3");
    expect(catalogSearch(filters).getAll("supply")).toEqual(["hybrid", "ready"]);
  });

  it("keeps price controls in the shareable URL but strips them from the anonymous query", () => {
    const filters = parseCatalogSearchParams({
      category: "not-a-uuid",
      price_min: "125000",
      sort: "price_asc",
      page: "-1",
    });
    expect(filters.categories).toEqual([]);
    expect(filters.sort).toBe("price_asc");
    expect(filters.priceMin).toBe("125000");
    expect(filters.page).toBe(1);
    expect(catalogSearch(filters).get("price_min")).toBe("125000");
    expect(publicCatalogSearch(filters).has("price_min")).toBe(false);
    expect(publicCatalogSearch(filters).has("sort")).toBe(false);
    expect(wholesaleCatalogSearch(filters).get("price_min")).toBe("1250000");
  });
});

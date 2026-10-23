import { publicCatalogFilters, type CatalogFilters } from "../utils/catalog-search";

export const catalogKeys = {
  all: ["catalog"] as const,
  quote: (scope: string, id: string) => [...catalogKeys.all, "quote", scope, id] as const,
  public: () => [...catalogKeys.all, "public"] as const,
  discovery: () => [...catalogKeys.public(), "discovery"] as const,
  products: (filters: CatalogFilters) =>
    [...catalogKeys.public(), "products", publicCatalogFilters(filters)] as const,
  product: (id: string) => [...catalogKeys.public(), "product", id] as const,
  reviews: (id: string, page: number) => [...catalogKeys.product(id), "reviews", page] as const,
  reviewImages: (id: string) => [...catalogKeys.public(), "review-images", id] as const,
  manufacturer: (id: string) => [...catalogKeys.public(), "manufacturer", id] as const,
  wholesale: () => [...catalogKeys.all, "wholesale"] as const,
  wholesaleAccess: () => [...catalogKeys.wholesale(), "access"] as const,
  wholesaleProducts: (scope: string, filters: CatalogFilters) =>
    [...catalogKeys.wholesale(), scope, "products", filters] as const,
  wholesaleProduct: (scope: string, id: string) =>
    [...catalogKeys.wholesale(), scope, "product", id] as const,
  management: () => [...catalogKeys.all, "management"] as const,
  studioAccess: (scope: string) => [...catalogKeys.management(), scope, "access"] as const,
  studio: (scope: string) => [...catalogKeys.management(), scope, "studio"] as const,
  editor: (scope: string, id: string) =>
    [...catalogKeys.management(), scope, "editor", id] as const,
  preview: (scope: string, id: string) => [...catalogKeys.editor(scope, id), "preview"] as const,
  operator: (scope: string) => [...catalogKeys.management(), scope, "operator"] as const,
  operatorReview: (scope: string, id: string) =>
    [...catalogKeys.operator(scope), "review", id] as const,
  operatorRevision: (scope: string, id: string) =>
    [...catalogKeys.operator(scope), "revision", id] as const,
};

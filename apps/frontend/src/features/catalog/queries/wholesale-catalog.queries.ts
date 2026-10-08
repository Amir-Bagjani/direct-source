import { queryOptions } from "@tanstack/react-query";
import type {
  WholesaleAccess,
  WholesaleProduct,
  WholesaleProductPage,
} from "../schemas/public-catalog.schema";
import type { CatalogFilters } from "../utils/catalog-search";
import { catalogKeys } from "./catalog.keys";

export type ReadWholesaleProducts = (
  filters: CatalogFilters,
  signal?: AbortSignal,
) => Promise<WholesaleProductPage>;
export type ReadWholesaleProduct = (id: string, signal?: AbortSignal) => Promise<WholesaleProduct>;

export function wholesaleAccessOptions(read: (signal?: AbortSignal) => Promise<WholesaleAccess>) {
  return queryOptions({
    queryKey: catalogKeys.wholesaleAccess(),
    queryFn: ({ signal }) => read(signal),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}

export function wholesaleProductsOptions(
  scope: string,
  filters: CatalogFilters,
  read: ReadWholesaleProducts,
) {
  return queryOptions({
    queryKey: catalogKeys.wholesaleProducts(scope, filters),
    queryFn: ({ signal }) => read(filters, signal),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}

export function wholesaleProductOptions(scope: string, id: string, read: ReadWholesaleProduct) {
  return queryOptions({
    queryKey: catalogKeys.wholesaleProduct(scope, id),
    queryFn: ({ signal }) => read(id, signal),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}

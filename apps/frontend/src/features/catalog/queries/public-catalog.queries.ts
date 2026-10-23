import { queryOptions } from "@tanstack/react-query";
import type {
  PublicManufacturer,
  PublicProduct,
  PublicProductPage,
  PublicDiscovery,
} from "../schemas/public-catalog.schema";
import type { CatalogFilters } from "../utils/catalog-search";
import { catalogKeys } from "./catalog.keys";

export function publicDiscoveryOptions(read: (signal?: AbortSignal) => Promise<PublicDiscovery>) {
  return queryOptions({ queryKey: catalogKeys.discovery(), queryFn: ({ signal }) => read(signal) });
}

export type ReadPublicProducts = (
  filters: CatalogFilters,
  signal?: AbortSignal,
) => Promise<PublicProductPage>;
export type ReadPublicProduct = (id: string, signal?: AbortSignal) => Promise<PublicProduct>;
export type ReadPublicManufacturer = (
  id: string,
  signal?: AbortSignal,
) => Promise<PublicManufacturer>;

export function publicProductsOptions(filters: CatalogFilters, read: ReadPublicProducts) {
  return queryOptions({
    queryKey: catalogKeys.products(filters),
    queryFn: ({ signal }) => read(filters, signal),
  });
}

export function publicProductOptions(id: string, read: ReadPublicProduct) {
  return queryOptions({
    queryKey: catalogKeys.product(id),
    queryFn: ({ signal }) => read(id, signal),
  });
}

export function publicManufacturerOptions(id: string, read: ReadPublicManufacturer) {
  return queryOptions({
    queryKey: catalogKeys.manufacturer(id),
    queryFn: ({ signal }) => read(id, signal),
  });
}

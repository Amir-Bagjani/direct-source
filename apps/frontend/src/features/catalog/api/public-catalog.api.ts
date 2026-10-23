"use client";
import { bffRequest } from "@/shared/api/browser-client";
import {
  publicManufacturerSchema,
  publicProductPageSchema,
  publicProductSchema,
  publicDiscoverySchema,
} from "../schemas/public-catalog.schema";
import { publicCatalogSearch, type CatalogFilters } from "../utils/catalog-search";

export function readPublicDiscovery(signal?: AbortSignal) {
  return bffRequest("/api/bff/catalog/discovery", publicDiscoverySchema, signal ? { signal } : {});
}

export function readPublicProducts(filters: CatalogFilters, signal?: AbortSignal) {
  const query = publicCatalogSearch(filters).toString();
  return bffRequest(
    `/api/bff/catalog/products${query ? `?${query}` : ""}`,
    publicProductPageSchema,
    signal ? { signal } : {},
  );
}

export function readPublicProduct(id: string, signal?: AbortSignal) {
  return bffRequest(
    `/api/bff/catalog/products/${encodeURIComponent(id)}`,
    publicProductSchema,
    signal ? { signal } : {},
  );
}

export function readPublicManufacturer(id: string, signal?: AbortSignal) {
  return bffRequest(
    `/api/bff/catalog/manufacturers/${encodeURIComponent(id)}`,
    publicManufacturerSchema,
    signal ? { signal } : {},
  );
}

"use client";
import { bffRequest } from "@/shared/api/browser-client";
import {
  wholesaleAccessSchema,
  wholesaleProductPageSchema,
  wholesaleProductSchema,
} from "../schemas/public-catalog.schema";
import { wholesaleCatalogSearch, type CatalogFilters } from "../utils/catalog-search";

export function readWholesaleAccess(signal?: AbortSignal) {
  return bffRequest(
    "/api/bff/catalog/wholesale/access",
    wholesaleAccessSchema,
    signal ? { signal } : {},
  );
}

export function readWholesaleProducts(filters: CatalogFilters, signal?: AbortSignal) {
  const query = wholesaleCatalogSearch(filters).toString();
  return bffRequest(
    `/api/bff/catalog/wholesale/products${query ? `?${query}` : ""}`,
    wholesaleProductPageSchema,
    signal ? { signal } : {},
  );
}

export function readWholesaleProduct(id: string, signal?: AbortSignal) {
  return bffRequest(
    `/api/bff/catalog/wholesale/products/${encodeURIComponent(id)}`,
    wholesaleProductSchema,
    signal ? { signal } : {},
  );
}

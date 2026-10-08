import "server-only";
import type { z } from "zod";
import { apiConfig } from "@/server/api-config";
import { ApiError, unwrap } from "@/shared/api/unwrap";
import {
  publicManufacturerSchema,
  publicProductPageSchema,
  publicProductSchema,
} from "../schemas/public-catalog.schema";
import {
  publicCatalogSearch,
  parseCatalogSearchParams,
  type CatalogFilters,
  type CatalogSearchParams,
} from "../utils/catalog-search";

async function publicRequest<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(8_000);
  const response = await fetch(`${apiConfig().backend}${path}`, {
    cache: "no-store",
    redirect: "error",
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  return unwrap(response, schema);
}

export function readPublicProductsOnServer(filters: CatalogFilters, signal?: AbortSignal) {
  const query = publicCatalogSearch(filters).toString();
  return publicRequest(
    `/api/v1/catalog/public/products/${query ? `?${query}` : ""}`,
    publicProductPageSchema,
    signal,
  );
}

export function readPublicProductOnServer(id: string, signal?: AbortSignal) {
  return publicRequest(`/api/v1/catalog/public/products/${id}/`, publicProductSchema, signal);
}

export function readPublicManufacturerOnServer(id: string, signal?: AbortSignal) {
  return publicRequest(
    `/api/v1/catalog/public/manufacturers/${id}/`,
    publicManufacturerSchema,
    signal,
  );
}

function searchParamsObject(search: URLSearchParams): CatalogSearchParams {
  const result: CatalogSearchParams = {};
  for (const key of new Set(search.keys())) {
    const all = search.getAll(key);
    result[key] = all.length === 1 ? all[0] : all;
  }
  return result;
}

function failure(error: unknown) {
  const status = error instanceof ApiError ? error.status : 503;
  const code = status === 400 ? "catalog_invalid_filters" : "catalog_unavailable";
  return Response.json(
    { code, message: code, request_id: crypto.randomUUID() },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function publicProductsBff(request: Request) {
  try {
    const filters = parseCatalogSearchParams(searchParamsObject(new URL(request.url).searchParams));
    return Response.json(await readPublicProductsOnServer(filters, request.signal), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}

export async function publicProductBff(request: Request, id: string) {
  try {
    return Response.json(await readPublicProductOnServer(id, request.signal), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}

export async function publicManufacturerBff(request: Request, id: string) {
  try {
    return Response.json(await readPublicManufacturerOnServer(id, request.signal), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}

import "server-only";
import { z } from "zod";
import {
  readCatalogPriceAccess,
  withCatalogWholesaleRead,
} from "@/features/accounts/contracts/catalog-session.server";
import { djangoRequest } from "@/server/django-request";
import { ApiError } from "@/shared/api/unwrap";
import {
  wholesaleAccessSchema,
  wholesaleProductPageSchema,
  wholesaleProductSchema,
} from "../schemas/public-catalog.schema";
import {
  parseCatalogSearchParams,
  wholesaleCatalogSearch,
  type CatalogSearchParams,
} from "../utils/catalog-search";

function searchParamsObject(search: URLSearchParams): CatalogSearchParams {
  const result: CatalogSearchParams = {};
  for (const key of new Set(search.keys())) {
    const all = search.getAll(key);
    result[key] = all.length === 1 ? all[0] : all;
  }
  return result;
}

function failure(error: unknown) {
  const status = error instanceof ApiError ? error.status : error instanceof z.ZodError ? 502 : 503;
  const code =
    status === 401
      ? "session_required"
      : status === 403
        ? "wholesale_required"
        : status === 400
          ? "catalog_invalid_filters"
          : "catalog_price_unavailable";
  return Response.json(
    { code, message: code, request_id: crypto.randomUUID() },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function wholesaleAccessBff(request: Request) {
  try {
    return Response.json(wholesaleAccessSchema.parse(await readCatalogPriceAccess(request)), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}

export async function wholesaleProductsBff(request: Request) {
  try {
    const filters = parseCatalogSearchParams(searchParamsObject(new URL(request.url).searchParams));
    const query = wholesaleCatalogSearch(filters).toString();
    const page = await withCatalogWholesaleRead(request, (access) =>
      djangoRequest(
        `/api/v1/catalog/public/products/${query ? `?${query}` : ""}`,
        wholesaleProductPageSchema,
        { method: "GET", access },
      ),
    );
    return Response.json(page, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return failure(error);
  }
}

export async function wholesaleProductBff(request: Request, id: string) {
  try {
    const product = await withCatalogWholesaleRead(request, (access) =>
      djangoRequest(`/api/v1/catalog/public/products/${id}/`, wholesaleProductSchema, {
        method: "GET",
        access,
      }),
    );
    return Response.json(product, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return failure(error);
  }
}

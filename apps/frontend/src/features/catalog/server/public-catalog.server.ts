import "server-only";
import { z } from "zod";
import { apiConfig } from "@/server/api-config";
import { ApiError, unwrap } from "@/shared/api/unwrap";
import {
  publicReviewSchema,
  publicReviewPageSchema,
  publicReviewImagesSchema,
} from "../schemas/public-reviews.schema";
import {
  publicManufacturerSchema,
  publicProductPageSchema,
  publicProductSchema,
  publicDiscoverySchema,
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

export function readPublicDiscoveryOnServer(signal?: AbortSignal) {
  return publicRequest("/api/v1/catalog/public/discovery/", publicDiscoverySchema, signal);
}

export async function publicDiscoveryBff(request: Request) {
  try {
    return Response.json(await readPublicDiscoveryOnServer(request.signal), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error);
  }
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

export async function publicReviewsBff(request: Request, id: string) {
  const search = new URL(request.url).searchParams;
  const page = z
    .string()
    .regex(/^[1-9]\d{0,6}$/)
    .transform(Number)
    .safeParse(search.get("page") ?? "1");
  if (
    !page.success ||
    [...search.keys()].some((key) => key !== "page") ||
    search.getAll("page").length > 1
  )
    return failure(new ApiError(400, "catalog_invalid_filters"));
  try {
    const result = await publicRequest(
      `/api/v1/reviews/public/?topic=product&product=${id}&page=${page.data}&page_size=5`,
      publicReviewPageSchema,
      request.signal,
    );
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}

export async function publicReviewImagesBff(request: Request, id: string) {
  try {
    const review = await publicRequest(
      `/api/v1/reviews/public/${id}/`,
      publicReviewSchema,
      request.signal,
    );
    const images = review.content_hidden
      ? []
      : await Promise.all(
          review.images.map(async (file) => {
            const image = await publicRequest(
              `/api/v1/reviews/public/${id}/images/${file}/`,
              z.object({ url: z.url() }).strict(),
              request.signal,
            );
            return image.url;
          }),
        );
    return Response.json(publicReviewImagesSchema.parse(images), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}

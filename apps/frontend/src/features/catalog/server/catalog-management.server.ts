import "server-only";
import { z } from "zod";
import { productPreviewSchema } from "../schemas/public-catalog.schema";
import {
  withCatalogAccountMutation,
  withCatalogAccountRead,
  readCatalogWorkspaceAccess,
} from "@/features/accounts/contracts/catalog-session.server";
import { authConfig } from "@/server/auth/config";
import { djangoResponse } from "@/server/django-request";
import { readBodyBytes, readJsonBody } from "@/server/read-body";
import { isSameOriginMutation } from "@/server/request-policy";
import { ApiError, unwrap } from "@/shared/api/unwrap";
import { quoteInputSchema } from "../schemas/catalog-quote.schema";
import { readQuoteResponse } from "./catalog-quote.server";
import {
  attributePageSchema,
  attributeSchema,
  categoryPageSchema,
  categorySchema,
  editorSchema,
  operatorDashboardSchema,
  optionPageSchema,
  optionSchema,
  productInputSchema,
  productPageSchema,
  productQueueSchema,
  productSchema,
  proposalInputSchema,
  proposalPageSchema,
  proposalSchema,
  reasonInputSchema,
  reviewDetailSchema,
  publicationReadinessSchema,
  reviewInputSchema,
  revisionQueueSchema,
  revisionPageSchema,
  revisionReviewInputSchema,
  revisionSchema,
  revisionReviewSchema,
  revisionInputSchema,
  salesPlanInputSchema,
  salesPlanSchema,
  servicePageSchema,
  shippingInputSchema,
  studioAccessSchema,
  studioSchema,
  supplyInputSchema,
  supplySchema,
  taxonomyMutationSchema,
  taxonomySchema,
  variantInputSchema,
  variantPageSchema,
  variantSchema,
} from "../schemas/catalog-management.schema";

const actionSchema = z.enum([
  "access",
  "studio",
  "editor",
  "operator",
  "review-detail",
  "preview",
  "revision",
  "product-save",
  "product-delete",
  "variant-save",
  "variant-delete",
  "variant-activation",
  "sales-save",
  "quote",
  "supply-save",
  "shipping-save",
  "upload",
  "submit",
  "activate",
  "deactivate",
  "reopen",
  "proposal-save",
  "proposal-review",
  "taxonomy-save",
  "claim",
  "review",
  "revision-save",
  "revision-submit",
  "revision-cancel",
  "revision-claim",
  "revision-review",
]);

const fileSchema = z.object({
  id: z.uuid(),
  purpose: z.literal("product_image"),
  size: z.number().int().positive(),
  content_type: z.enum(["image/jpeg", "image/png", "image/webp"]),
  scan_status: z.literal("clean"),
});
const emptySchema = z.undefined();
const idSchema = z.uuid();

async function catalogRequest<T>(
  path: `/api/v1/${string}`,
  schema: z.ZodType<T>,
  options: Parameters<typeof djangoResponse>[1],
) {
  return unwrap(await djangoResponse(path, options), schema);
}

async function optionalRequest<T>(promise: Promise<T>) {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

async function taxonomy(access: string) {
  const [categories, attributes, options] = await Promise.all([
    catalogRequest("/api/v1/catalog/categories/?page_size=100", categoryPageSchema, {
      method: "GET",
      access,
    }),
    catalogRequest("/api/v1/catalog/attributes/?page_size=100", attributePageSchema, {
      method: "GET",
      access,
    }),
    catalogRequest("/api/v1/catalog/attribute-options/?page_size=100", optionPageSchema, {
      method: "GET",
      access,
    }),
  ]);
  if (categories.next || attributes.next || options.next)
    throw new ApiError(409, "catalog_taxonomy_page_limit");
  return taxonomySchema.parse({
    categories: categories.results,
    attributes: attributes.results,
    options: options.results,
  });
}

function queryId(request: Request, name: string) {
  return idSchema.parse(new URL(request.url).searchParams.get(name));
}

async function editorData(access: string, productId: string) {
  const [product, variants, tax, services, salesPlan, shipping, revisions, readiness] =
    await Promise.all([
      catalogRequest(`/api/v1/catalog/products/${productId}/`, productSchema, {
        method: "GET",
        access,
      }),
      catalogRequest(
        `/api/v1/catalog/products/${productId}/variants/?page_size=100`,
        variantPageSchema,
        { method: "GET", access },
      ),
      taxonomy(access),
      catalogRequest("/api/v1/logistics/services/?page_size=100", servicePageSchema, {
        method: "GET",
        access,
      }),
      optionalRequest(
        catalogRequest(`/api/v1/catalog/products/${productId}/sales-plan/`, salesPlanSchema, {
          method: "GET",
          access,
        }),
      ),
      optionalRequest(
        catalogRequest(`/api/v1/logistics/products/${productId}/shipping/`, shippingInputSchema, {
          method: "GET",
          access,
        }),
      ),
      catalogRequest(
        `/api/v1/catalog/products/${productId}/revisions/?page_size=100`,
        revisionPageSchema,
        {
          method: "GET",
          access,
        },
      ),
      catalogRequest(
        `/api/v1/catalog/products/${productId}/readiness/`,
        publicationReadinessSchema,
        { method: "GET", access },
      ),
    ]);
  if (variants.next || services.next) throw new ApiError(409, "catalog_editor_page_limit");
  const supplyEntries = await Promise.all(
    variants.results.map(
      async (variant) =>
        [
          variant.id,
          await optionalRequest(
            catalogRequest(
              `/api/v1/catalog/products/${productId}/variants/${variant.id}/supply/`,
              supplySchema,
              { method: "GET", access },
            ),
          ),
        ] as const,
    ),
  );
  return editorSchema.parse({
    product,
    variants: variants.results,
    sales_plan: salesPlan,
    shipping,
    supplies: Object.fromEntries(supplyEntries.filter((entry) => entry[1] !== null)),
    services: services.results,
    taxonomy: tax,
    revisions: revisions.results,
    readiness,
  });
}

function failure(error: unknown) {
  const status = error instanceof z.ZodError ? 400 : error instanceof ApiError ? error.status : 503;
  const code =
    error instanceof ApiError && ![401, 403].includes(error.status)
      ? error.code
      : status === 401
        ? "session_required"
        : status === 403
          ? "catalog_forbidden"
          : status === 400
            ? "catalog_invalid_input"
            : "catalog_management_unavailable";
  return Response.json(
    {
      code,
      message: code,
      request_id: crypto.randomUUID(),
      ...(error instanceof ApiError && error.fields !== undefined ? { fields: error.fields } : {}),
    },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function catalogManagementBff(request: Request, actionName: string) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const action = actionSchema.parse(actionName);
    const read = [
      "access",
      "studio",
      "editor",
      "operator",
      "review-detail",
      "revision",
      "preview",
    ].includes(action);
    if (request.method !== (read ? "GET" : "POST")) throw new ApiError(405, "method_not_allowed");
    if (!isSameOriginMutation(request, authConfig().origin))
      throw new ApiError(403, "invalid_request_origin");

    if (read) {
      if (action === "access")
        return Response.json(studioAccessSchema.parse(await readCatalogWorkspaceAccess(request)), {
          headers,
        });
      const data = await withCatalogAccountRead(request, async (access) => {
        if (action === "studio") {
          const [tax, products, proposals] = await Promise.all([
            taxonomy(access),
            catalogRequest("/api/v1/catalog/products/?page_size=100", productPageSchema, {
              method: "GET",
              access,
            }),
            catalogRequest("/api/v1/catalog/proposals/?page_size=100", proposalPageSchema, {
              method: "GET",
              access,
            }),
          ]);
          if (products.next || proposals.next) throw new ApiError(409, "catalog_studio_page_limit");
          return studioSchema.parse({
            taxonomy: tax,
            products: products.results,
            proposals: proposals.results,
          });
        }
        if (action === "editor") return editorData(access, queryId(request, "id"));
        if (action === "preview")
          return catalogRequest(
            `/api/v1/catalog/products/${queryId(request, "id")}/preview/`,
            productPreviewSchema,
            { method: "GET", access },
          );
        if (action === "review-detail")
          return catalogRequest(
            `/api/v1/catalog/review-products/${queryId(request, "id")}/`,
            reviewDetailSchema,
            { method: "GET", access },
          );
        if (action === "revision") {
          const [revision, tax] = await Promise.all([
            catalogRequest(`/api/v1/catalog/revisions/${queryId(request, "id")}/`, revisionSchema, {
              method: "GET",
              access,
            }),
            taxonomy(access),
          ]);
          return revisionReviewSchema.parse({ revision, taxonomy: tax });
        }
        const [tax, products, revisions, proposals] = await Promise.all([
          taxonomy(access),
          catalogRequest("/api/v1/catalog/review-queue/?page_size=100", productQueueSchema, {
            method: "GET",
            access,
          }),
          catalogRequest("/api/v1/catalog/revision-queue/?page_size=100", revisionQueueSchema, {
            method: "GET",
            access,
          }),
          catalogRequest(
            "/api/v1/catalog/proposals/?status=pending&page_size=100",
            proposalPageSchema,
            {
              method: "GET",
              access,
            },
          ),
        ]);
        return operatorDashboardSchema.parse({
          taxonomy: tax,
          products: products.results,
          revisions: revisions.results,
          proposals: proposals.results,
        });
      });
      return Response.json(data, { headers });
    }

    const result = await withCatalogAccountMutation(request, async (access) => {
      const url = new URL(request.url);
      const id = url.searchParams.get("id");
      const productId = url.searchParams.get("product");
      if (action === "upload") {
        const businessId = idSchema.parse(url.searchParams.get("business"));
        const type = request.headers.get("content-type") ?? "";
        if (!type.startsWith("multipart/form-data;"))
          throw new ApiError(415, "unsupported_media_type");
        const bytes = await readBodyBytes(request, 6 * 1024 * 1024);
        const form = await new Response(bytes, { headers: { "Content-Type": type } }).formData();
        const file = form.get("file");
        if (
          !(file instanceof File) ||
          form.getAll("file").length !== 1 ||
          file.size === 0 ||
          file.size > 5 * 1024 * 1024
        )
          throw new ApiError(400, "catalog_invalid_image");
        const clean = new FormData();
        clean.set("file", file);
        clean.set("purpose", "product_image");
        clean.set("consent_version", z.string().min(1).max(40).parse(form.get("consent_version")));
        return catalogRequest(`/api/v1/businesses/${businessId}/files/`, fileSchema, {
          method: "POST",
          access,
          form: clean,
        });
      }
      const body = await readJsonBody(request, 256 * 1024);
      if (action === "quote")
        return readQuoteResponse(
          await djangoResponse(`/api/v1/catalog/products/${idSchema.parse(productId)}/quote/`, {
            method: "POST",
            access,
            body: quoteInputSchema.parse(body),
          }),
        );
      if (action === "product-save") {
        const input = productInputSchema.parse(body);
        return catalogRequest(
          id ? `/api/v1/catalog/products/${idSchema.parse(id)}/` : "/api/v1/catalog/products/",
          productSchema,
          { method: id ? "PATCH" : "POST", access, body: input },
        );
      }
      if (action === "product-delete")
        return catalogRequest(
          `/api/v1/catalog/products/${idSchema.parse(id)}/delete/`,
          emptySchema,
          {
            method: "POST",
            access,
            body: z.object({ confirm: z.literal(true) }).parse(body),
          },
        );
      if (action === "variant-save") {
        const product = idSchema.parse(productId);
        const input = variantInputSchema.parse(body);
        return catalogRequest(
          id
            ? `/api/v1/catalog/products/${product}/variants/${idSchema.parse(id)}/`
            : `/api/v1/catalog/products/${product}/variants/`,
          variantSchema,
          { method: id ? "PATCH" : "POST", access, body: input },
        );
      }
      if (action === "variant-delete")
        return catalogRequest(
          `/api/v1/catalog/products/${idSchema.parse(productId)}/variants/${idSchema.parse(id)}/`,
          emptySchema,
          { method: "DELETE", access },
        );
      if (action === "variant-activation")
        return catalogRequest(
          `/api/v1/catalog/products/${idSchema.parse(productId)}/variants/${idSchema.parse(id)}/activation/`,
          variantSchema,
          {
            method: "POST",
            access,
            body: z
              .object({ enabled: z.boolean(), reason: z.string().min(1).max(2000) })
              .parse(body),
          },
        );
      if (action === "sales-save")
        return catalogRequest(
          `/api/v1/catalog/products/${idSchema.parse(productId)}/sales-plan/`,
          salesPlanSchema,
          { method: "PUT", access, body: salesPlanInputSchema.parse(body) },
        );
      if (action === "supply-save")
        return catalogRequest(
          `/api/v1/catalog/products/${idSchema.parse(productId)}/variants/${idSchema.parse(id)}/supply/`,
          supplySchema,
          { method: "PUT", access, body: supplyInputSchema.parse(body) },
        );
      if (action === "shipping-save")
        return catalogRequest(
          `/api/v1/logistics/products/${idSchema.parse(productId)}/shipping/`,
          shippingInputSchema,
          { method: "PUT", access, body: shippingInputSchema.parse(body) },
        );
      if (action === "proposal-save")
        return catalogRequest("/api/v1/catalog/proposals/", proposalSchema, {
          method: "POST",
          access,
          body: proposalInputSchema.parse(body),
        });
      if (action === "taxonomy-save") {
        const input = taxonomyMutationSchema.parse(body);
        if (input.kind === "category") {
          const { kind: _kind, id: taxonomyId, ...definition } = input;
          return catalogRequest(
            taxonomyId
              ? `/api/v1/catalog/categories/${taxonomyId}/`
              : "/api/v1/catalog/categories/",
            categorySchema,
            { method: taxonomyId ? "PATCH" : "POST", access, body: definition },
          );
        }
        if (input.kind === "attribute") {
          const { kind: _kind, id: taxonomyId, type, ...definition } = input;
          return catalogRequest(
            taxonomyId
              ? `/api/v1/catalog/attributes/${taxonomyId}/`
              : "/api/v1/catalog/attributes/",
            attributeSchema,
            {
              method: taxonomyId ? "PATCH" : "POST",
              access,
              body: { ...definition, kind: type },
            },
          );
        }
        const { kind: _kind, id: taxonomyId, ...definition } = input;
        return catalogRequest(
          taxonomyId
            ? `/api/v1/catalog/attribute-options/${taxonomyId}/`
            : "/api/v1/catalog/attribute-options/",
          optionSchema,
          { method: taxonomyId ? "PATCH" : "POST", access, body: definition },
        );
      }
      if (action === "proposal-review")
        return catalogRequest(
          `/api/v1/catalog/proposals/${idSchema.parse(id)}/review/`,
          proposalSchema,
          {
            method: "POST",
            access,
            body,
          },
        );
      if (["submit", "claim"].includes(action))
        return catalogRequest(
          `/api/v1/catalog/products/${idSchema.parse(id)}/${action}/`,
          productSchema,
          {
            method: "POST",
            access,
          },
        );
      if (["activate", "deactivate", "reopen"].includes(action))
        return catalogRequest(
          `/api/v1/catalog/products/${idSchema.parse(id)}/${action}/`,
          productSchema,
          {
            method: "POST",
            access,
            body: reasonInputSchema.parse(body),
          },
        );
      if (action === "review")
        return catalogRequest(
          `/api/v1/catalog/products/${idSchema.parse(id)}/review/`,
          productSchema,
          {
            method: "POST",
            access,
            body: reviewInputSchema.parse(body),
          },
        );
      if (action === "revision-save") {
        const changes = revisionInputSchema.parse(body);
        return catalogRequest(
          id
            ? `/api/v1/catalog/revisions/${idSchema.parse(id)}/`
            : `/api/v1/catalog/products/${idSchema.parse(productId)}/revisions/`,
          revisionSchema,
          { method: id ? "PUT" : "POST", access, body: changes },
        );
      }
      if (["revision-submit", "revision-claim", "revision-cancel"].includes(action)) {
        const command = action.replace("revision-", "");
        return catalogRequest(
          `/api/v1/catalog/revisions/${idSchema.parse(id)}/${command}/`,
          revisionSchema,
          {
            method: "POST",
            access,
            ...(command === "cancel" ? { body: reasonInputSchema.parse(body) } : {}),
          },
        );
      }
      if (action === "revision-review")
        return catalogRequest(
          `/api/v1/catalog/revisions/${idSchema.parse(id)}/review/`,
          revisionSchema,
          {
            method: "POST",
            access,
            body: revisionReviewInputSchema.parse(body),
          },
        );
      throw new ApiError(400, "catalog_unknown_action");
    });
    return result === undefined
      ? new Response(null, { status: 204, headers })
      : Response.json(result, { headers });
  } catch (error) {
    return failure(error);
  }
}

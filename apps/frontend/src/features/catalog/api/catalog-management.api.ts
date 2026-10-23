"use client";
import { z } from "zod";
import { productPreviewSchema } from "../schemas/public-catalog.schema";
import { bffRequest } from "@/shared/api/browser-client";
import {
  editorSchema,
  operatorDashboardSchema,
  productSchema,
  proposalSchema,
  reviewDetailSchema,
  revisionSchema,
  revisionReviewSchema,
  studioAccessSchema,
  studioSchema,
  variantSchema,
  salesPlanSchema,
  supplySchema,
  shippingInputSchema,
  categorySchema,
  attributeSchema,
  optionSchema,
  taxonomyMutationSchema,
  type ProductInput,
  type SalesPlanInput,
  type ShippingInput,
  type SupplyInput,
  type VariantInput,
} from "../schemas/catalog-management.schema";

const completedSchema = z.undefined();

function endpoint(action: string, params?: Record<string, string>) {
  const search = new URLSearchParams(params);
  return `/api/bff/catalog/studio/${action}${search.size ? `?${search}` : ""}`;
}

function post<T>(
  action: string,
  schema: z.ZodType<T>,
  body: unknown,
  params?: Record<string, string>,
) {
  return bffRequest(endpoint(action, params), schema, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export const readStudioAccess = (signal?: AbortSignal) =>
  bffRequest(endpoint("access"), studioAccessSchema, signal ? { signal } : {});
export const readStudio = (signal?: AbortSignal) =>
  bffRequest(endpoint("studio"), studioSchema, signal ? { signal } : {});
export const readEditor = (id: string, signal?: AbortSignal) =>
  bffRequest(endpoint("editor", { id }), editorSchema, signal ? { signal } : {});
export const readOperatorDashboard = (signal?: AbortSignal) =>
  bffRequest(endpoint("operator"), operatorDashboardSchema, signal ? { signal } : {});
export const readReviewDetail = (id: string, signal?: AbortSignal) =>
  bffRequest(endpoint("review-detail", { id }), reviewDetailSchema, signal ? { signal } : {});
export const readRevision = (id: string, signal?: AbortSignal) =>
  bffRequest(endpoint("revision", { id }), revisionReviewSchema, signal ? { signal } : {});

export const saveProduct = (input: ProductInput, id?: string) =>
  post("product-save", productSchema, input, id ? { id } : undefined);
export const deleteProduct = (id: string) =>
  post("product-delete", completedSchema, { confirm: true }, { id });
export const saveVariant = (product: string, input: VariantInput, id?: string) =>
  post("variant-save", variantSchema, input, { product, ...(id ? { id } : {}) });
export const deleteVariant = (product: string, id: string) =>
  post("variant-delete", completedSchema, {}, { product, id });
export const setVariantActivation = (
  product: string,
  id: string,
  enabled: boolean,
  reason: string,
) => post("variant-activation", variantSchema, { enabled, reason }, { product, id });
export const saveSalesPlan = (product: string, input: SalesPlanInput) =>
  post("sales-save", salesPlanSchema, input, { product });
export const saveSupply = (product: string, id: string, input: SupplyInput) =>
  post("supply-save", supplySchema, input, { product, id });
export const saveShipping = (product: string, input: ShippingInput) =>
  post("shipping-save", shippingInputSchema, input, { product });
export const submitProduct = (id: string) => post("submit", productSchema, {}, { id });
export const productCommand = (
  action: "activate" | "deactivate" | "reopen",
  id: string,
  reason: string,
) => post(action, productSchema, { reason }, { id });
export const claimProduct = (id: string) => post("claim", productSchema, {}, { id });
export const reviewProduct = (id: string, decision: string, code: string, reason: string) =>
  post("review", productSchema, { decision, code, reason }, { id });
export const saveProposal = (body: unknown) => post("proposal-save", proposalSchema, body);
export const reviewProposal = (id: string, body: unknown) =>
  post("proposal-review", proposalSchema, body, { id });
export async function saveTaxonomy(body: unknown) {
  const input = taxonomyMutationSchema.parse(body);
  if (input.kind === "category") return post("taxonomy-save", categorySchema, input);
  if (input.kind === "attribute") return post("taxonomy-save", attributeSchema, input);
  return post("taxonomy-save", optionSchema, input);
}
export const saveRevision = (product: string, body: unknown, id?: string) =>
  post("revision-save", revisionSchema, body, { product, ...(id ? { id } : {}) });
export const revisionCommand = (
  action: "revision-submit" | "revision-claim" | "revision-cancel",
  id: string,
  body: unknown = {},
) => post(action, revisionSchema, body, { id });
export const reviewRevision = (id: string, decision: string, code: string, reason: string) =>
  post("revision-review", revisionSchema, { decision, code, reason }, { id });

export function uploadProductImage(business: string, consentVersion: string, file: File) {
  const form = new FormData();
  form.set("file", file);
  form.set("consent_version", consentVersion);
  return bffRequest(
    endpoint("upload", { business }),
    z.object({ id: z.uuid(), scan_status: z.literal("clean") }),
    { method: "POST", body: form },
  );
}

export const readProductPreview = (id: string, signal?: AbortSignal) =>
  bffRequest(endpoint("preview", { id }), productPreviewSchema, signal ? { signal } : {});

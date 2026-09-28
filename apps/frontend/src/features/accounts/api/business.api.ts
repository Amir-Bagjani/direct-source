"use client";
import { bffRequest } from "@/shared/api/browser-client";
import {
  businessInputSchema,
  businessResultSchema,
  businessCreatedSchema,
} from "../schemas/business.schema";
import type { BusinessInput } from "../schemas/business.schema";
export function readBusiness(signal: AbortSignal) {
  return bffRequest("/api/bff/accounts/business", businessResultSchema, { signal });
}
export function createBusiness(input: BusinessInput) {
  return bffRequest("/api/bff/accounts/business", businessCreatedSchema, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(businessInputSchema.parse(input)),
  });
}

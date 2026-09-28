"use client";
import { z } from "zod";
import { bffRequest } from "@/shared/api/browser-client";
import { completeSchema } from "../schemas/onboarding.schema";
import type { TrustAction } from "../schemas/trust.schema";
export function trustUrl(action: TrustAction, id = "", page = 1, kind = "suspension") {
  const params = new URLSearchParams({ page: String(page), kind });
  if (id) params.set("id", z.uuid().parse(id));
  return `/api/bff/accounts/trust/${action}?${params}`;
}
export function readTrust<T>(
  action: TrustAction,
  schema: z.ZodType<T>,
  signal: AbortSignal,
  id = "",
  page = 1,
  kind = "suspension",
) {
  return bffRequest(trustUrl(action, id, page, kind), schema, { signal });
}
export function writeTrust(
  action: TrustAction,
  id: string,
  body: unknown = {},
  kind = "suspension",
) {
  return bffRequest(trustUrl(action, id, 1, kind), completeSchema, {
    method: action === "revision-update" ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

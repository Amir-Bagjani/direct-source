"use client";
import { z } from "zod";
import { bffRequest } from "@/shared/api/browser-client";
import { businessSchema } from "../schemas/business.schema";
import {
  policySchema,
  queueSchema,
  sectionsSchema,
  fileSchema,
  completeSchema,
} from "../schemas/onboarding.schema";
import type { OnboardingAction } from "../schemas/onboarding.schema";
export function onboardingUrl(action: OnboardingAction, id: string) {
  return `/api/bff/accounts/onboarding/${action}?id=${z.uuid().parse(id)}`;
}
export const readPolicy = (signal: AbortSignal) =>
  bffRequest("/api/bff/accounts/onboarding/policy", policySchema, { signal });
export const readQueue = (page: number, signal: AbortSignal) =>
  bffRequest(`/api/bff/accounts/onboarding/queue?page=${page}`, queueSchema, { signal });
export const readSections = (id: string, signal: AbortSignal) =>
  bffRequest(onboardingUrl("sections", id), sectionsSchema, { signal });
export const readBusinessDetail = (id: string, signal: AbortSignal) =>
  bffRequest(onboardingUrl("detail", id), businessSchema, { signal });
export function writeOnboarding(
  action: "draft" | "identity" | "activity" | "submit" | "claim" | "review" | "reopen",
  id: string,
  body?: unknown,
) {
  return bffRequest(onboardingUrl(action, id), completeSchema, {
    method: ["draft", "identity", "activity"].includes(action) ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
export function uploadBusinessFile(
  id: string,
  file: File,
  purpose: "identity" | "activity" | "business_logo" | "suspension" | "support",
  consent: string,
) {
  const body = new FormData();
  body.set("file", file);
  body.set("purpose", purpose);
  body.set("consent_version", consent);
  return bffRequest(onboardingUrl("upload", id), fileSchema, { method: "POST", body });
}

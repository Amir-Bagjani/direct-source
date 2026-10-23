"use client";
import { bffRequest } from "@/shared/api/browser-client";
import { publicReviewPageSchema, publicReviewImagesSchema } from "../schemas/public-reviews.schema";

export function readPublicReviews(id: string, page: number, signal?: AbortSignal) {
  return bffRequest(
    `/api/bff/catalog/products/${encodeURIComponent(id)}/reviews?page=${page}`,
    publicReviewPageSchema,
    signal ? { signal } : {},
  );
}
export function readPublicReviewImages(id: string, signal?: AbortSignal) {
  return bffRequest(
    `/api/bff/catalog/reviews/${encodeURIComponent(id)}/images`,
    publicReviewImagesSchema,
    signal ? { signal } : {},
  );
}

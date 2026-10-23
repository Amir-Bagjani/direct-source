import { queryOptions } from "@tanstack/react-query";
import type { PublicReviewPage } from "../schemas/public-reviews.schema";
import { catalogKeys } from "./catalog.keys";

export function publicReviewsOptions(
  id: string,
  page: number,
  read: (id: string, page: number, signal?: AbortSignal) => Promise<PublicReviewPage>,
) {
  return queryOptions({
    queryKey: catalogKeys.reviews(id, page),
    queryFn: ({ signal }) => read(id, page, signal),
  });
}
export function publicReviewImagesOptions(
  id: string,
  read: (id: string, signal?: AbortSignal) => Promise<string[]>,
) {
  return queryOptions({
    queryKey: catalogKeys.reviewImages(id),
    queryFn: ({ signal }) => read(id, signal),
    staleTime: 0,
    gcTime: 0,
  });
}

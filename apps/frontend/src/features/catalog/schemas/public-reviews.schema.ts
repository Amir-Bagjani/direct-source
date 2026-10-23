import { z } from "zod";
import type { components } from "@/shared/api/openapi";

export const publicReviewSchema = z
  .object({
    id: z.uuid(),
    topic: z.literal("product"),
    product: z.uuid(),
    variants: z.array(z.uuid()),
    author_label: z.string(),
    scores: z
      .object({
        quality: z.number().int().min(1).max(5),
        conformity: z.number().int().min(1).max(5),
        overall: z.number().int().min(1).max(5),
      })
      .strict(),
    text: z.string(),
    images: z.array(z.uuid()).max(10),
    content_hidden: z.boolean(),
    published_at: z.iso.datetime(),
    reply: z
      .object({
        id: z.uuid(),
        text: z.string(),
        submitted_at: z.iso.datetime().nullable(),
        content_hidden: z.boolean(),
        author_label: z.string(),
      })
      .strict()
      .nullable(),
  })
  .strict() satisfies z.ZodType<components["schemas"]["ReviewOutput"]>;
export const publicReviewPageSchema = z
  .object({
    count: z.number().int().nonnegative(),
    next: z.url().nullable(),
    previous: z.url().nullable(),
    results: z.array(publicReviewSchema),
  })
  .strict();
export const publicReviewImagesSchema = z.array(z.url()).max(10);
export type PublicReview = z.infer<typeof publicReviewSchema>;
export type PublicReviewPage = z.infer<typeof publicReviewPageSchema>;

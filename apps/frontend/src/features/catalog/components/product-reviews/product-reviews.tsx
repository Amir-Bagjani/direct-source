"use client";
import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { readPublicReviews, readPublicReviewImages } from "../../api/public-reviews.api";
import {
  publicReviewsOptions,
  publicReviewImagesOptions,
} from "../../queries/public-reviews.queries";
import type { PublicReview } from "../../schemas/public-reviews.schema";
import { Alert, AlertTitle, AlertDescription } from "@/shared/ui/alert/alert";
import { Button } from "@/shared/ui/button/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/shared/ui/card/card";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/shared/ui/empty/empty";
import { ProductGallery } from "../product-gallery/product-gallery";

function ReviewCard({ review }: { review: PublicReview }) {
  const t = useTranslations("catalog.reviews");
  const common = useTranslations("common");
  const format = useFormatter();
  const [imagesOpen, setImagesOpen] = useState(false);
  const imageId = useId();
  const images = useQuery({
    ...publicReviewImagesOptions(review.id, readPublicReviewImages),
    enabled: imagesOpen && !review.content_hidden,
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("verifiedBuyer")}</CardTitle>
        <CardDescription>
          <time dateTime={review.published_at}>
            {format.dateTime(new Date(review.published_at), {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </time>
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <dl className="grid gap-3 sm:grid-cols-3">
          {(["overall", "quality", "conformity"] as const).map((criterion) => (
            <div key={criterion}>
              <dt className="text-sm text-muted-foreground">{t(criterion)}</dt>
              <dd className="font-medium">
                {t("score", { value: format.number(review.scores[criterion]) })}
              </dd>
            </div>
          ))}
        </dl>
        {review.content_hidden ? (
          <p className="text-sm text-muted-foreground">{t("hidden")}</p>
        ) : (
          <>
            {review.text && (
              <p className="whitespace-pre-wrap break-words leading-7">{review.text}</p>
            )}
            {review.images.length > 0 && (
              <>
                <Button
                  variant="outline"
                  className="w-fit"
                  aria-expanded={imagesOpen}
                  aria-controls={imageId}
                  onClick={() => setImagesOpen(!imagesOpen)}
                >
                  {imagesOpen ? t("hideImages") : t("showImages", { count: review.images.length })}
                </Button>
                {imagesOpen && (
                  <div id={imageId} className="max-w-xl">
                    {images.isPending ? (
                      <p role="status">{t("loadingImages")}</p>
                    ) : images.isError ? (
                      <Alert variant="destructive">
                        <AlertTitle>{t("imagesUnavailable")}</AlertTitle>
                        <AlertDescription>
                          <Button variant="outline" onClick={() => void images.refetch()}>
                            {common("retry")}
                          </Button>
                        </AlertDescription>
                      </Alert>
                    ) : images.data.length ? (
                      <ProductGallery
                        key={images.data.join("\n")}
                        name={t("imagesLabel")}
                        images={images.data}
                      />
                    ) : (
                      <p>{t("imagesUnavailable")}</p>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
        {review.reply && (
          <blockquote className="grid gap-2 border-s-2 ps-4">
            <p className="font-medium">{t("reply", { name: review.reply.author_label })}</p>
            <p className="whitespace-pre-wrap break-words text-sm leading-6">
              {review.reply.content_hidden ? t("hidden") : review.reply.text}
            </p>
          </blockquote>
        )}
      </CardContent>
    </Card>
  );
}

export function ProductReviews({ id }: { id: string }) {
  const t = useTranslations("catalog.reviews");
  const catalog = useTranslations("catalog");
  const common = useTranslations("common");
  const headingId = useId();
  const [page, setPage] = useState(1);
  const reviews = useQuery(publicReviewsOptions(id, page, readPublicReviews));
  return (
    <section aria-labelledby={headingId} className="grid gap-4">
      <div className="grid gap-2">
        <h2 id={headingId} className="text-2xl font-semibold">
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <div aria-live="polite" aria-busy={reviews.isFetching} className="grid gap-4">
        {reviews.isPending ? (
          <p role="status">{t("loading")}</p>
        ) : reviews.isError ? (
          <Alert variant="destructive">
            <AlertTitle>{t("unavailable")}</AlertTitle>
            <AlertDescription>
              {t("retryDescription")}
              <Button variant="outline" onClick={() => void reviews.refetch()}>
                {common("retry")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {reviews.data.results.length ? (
              reviews.data.results.map((review) => <ReviewCard key={review.id} review={review} />)
            ) : (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>{t("empty")}</EmptyTitle>
                  <EmptyDescription>{t("emptyDescription")}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
            {(reviews.data.previous || reviews.data.next) && (
              <nav
                aria-label={t("pagination")}
                className="flex flex-wrap items-center justify-center gap-3"
              >
                <Button
                  variant="outline"
                  disabled={!reviews.data.previous}
                  onClick={() => setPage(page - 1)}
                >
                  {catalog("previous")}
                </Button>
                <span className="text-sm text-muted-foreground">{catalog("page", { page })}</span>
                <Button
                  variant="outline"
                  disabled={!reviews.data.next}
                  onClick={() => setPage(page + 1)}
                >
                  {catalog("next")}
                </Button>
              </nav>
            )}
          </>
        )}
      </div>
    </section>
  );
}

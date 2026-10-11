"use client";
import { useProtectedSession } from "../protected-session-boundary/protected-session-context";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouter } from "@/i18n/navigation";
import { buttonVariants } from "@/shared/ui/button/button.variants";
import { useTranslations } from "next-intl";
import { ApiError } from "@/shared/api/unwrap";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/ui/card/card";
import { Button } from "@/shared/ui/button/button";
import { reviewQueueOptions } from "../../queries/onboarding.queries";
import { useOnboardingMutation } from "../../hooks/use-onboarding-mutation";
import { writeOnboarding } from "../../api/onboarding.api";
import type { VerificationReviewProps } from "./verification-review.types";
export function VerificationReview({ userId }: VerificationReviewProps) {
  const { authorized } = useProtectedSession();
  const t = useTranslations("accounts.onboarding");
  const [page, setPage] = useState(1);
  const router = useRouter();
  const [claimId, setClaimId] = useState("");
  const queue = useQuery({ ...reviewQueueOptions(userId, page), enabled: authorized });
  const claim = useOnboardingMutation(userId, () => writeOnboarding("claim", claimId));
  if (queue.error instanceof ApiError && queue.error.status === 403) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("reviewQueue")}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {queue.isPending ? (
          <p role="status">{t("loading")}</p>
        ) : queue.isError ? (
          <>
            <p role="alert">{t("loadError")}</p>
            <Button onClick={() => void queue.refetch()}>{t("retry")}</Button>
          </>
        ) : (
          <>
            {!queue.data?.results.length && <p>{t("emptyQueue")}</p>}
            {queue.data?.results.map((row) => (
              <div key={row.id} className="flex flex-wrap items-center gap-2">
                <bdi>{row.business_id}</bdi>
                <span>{t(`statuses.${row.status}`)}</span>
                {row.assigned_to_id === null ? (
                  <Button
                    disabled={claim.isPending}
                    onClick={() => {
                      setClaimId(row.business_id);
                    }}
                  >
                    {t("selectClaim")}
                  </Button>
                ) : (
                  <Link
                    className={buttonVariants({ variant: "outline" })}
                    href={`/account/operations/businesses/${row.business_id}`}
                  >
                    {t("openCase")}
                  </Link>
                )}
              </div>
            ))}
            {claimId && (
              <Button
                disabled={claim.isPending}
                onClick={() =>
                  claim.mutate(undefined, {
                    onSuccess: () => {
                      router.push(`/account/operations/businesses/${claimId}`);
                      setClaimId("");
                    },
                  })
                }
              >
                {t("claim")}
              </Button>
            )}
            {claim.isError && <p role="alert">{t("saveError")}</p>}
            <div className="flex gap-2">
              <Button variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                {t("previous")}
              </Button>
              <Button
                variant="outline"
                disabled={page * 25 >= (queue.data?.count ?? 0)}
                onClick={() => setPage((p) => p + 1)}
              >
                {t("next")}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/ui/button/button";
import { trustOptions } from "../../queries/trust.queries";
import { revisionQueueSchema, revisionSchema } from "../../schemas/trust.schema";
import { useOnboardingMutation } from "../../hooks/use-onboarding-mutation";
import { writeTrust } from "../../api/trust.api";
import { RevisionRecord } from "../revision-record/revision-record";
import type { RevisionReviewProps } from "./revision-review.types";
export function RevisionReview({ userId }: RevisionReviewProps) {
  const t = useTranslations("accounts.trust");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState("");
  const [claimId, setClaimId] = useState("");
  const queue = useQuery(trustOptions(userId, "revision-queue", revisionQueueSchema, "", page));
  const detail = useQuery({
    ...trustOptions(userId, "revision", revisionSchema, selected),
    enabled: !!selected,
  });
  const claim = useOnboardingMutation(userId, () => writeTrust("revision-claim", claimId));
  return (
    <section className="flex flex-col gap-4">
      <h3>{t("revisionQueue")}</h3>
      {queue.isPending ? (
        <p role="status">{t("loading")}</p>
      ) : queue.isError ? (
        <Button onClick={() => void queue.refetch()}>{t("retry")}</Button>
      ) : (
        <>
          {!queue.data.results.length && <p>{t("empty")}</p>}
          {queue.data.results.map((row) => (
            <div key={row.id} className="flex flex-wrap gap-2">
              <bdi>{row.id}</bdi>
              <Button
                onClick={() => (row.assigned_to_id ? setSelected(row.id) : setClaimId(row.id))}
              >
                {t(row.assigned_to_id ? "open" : "selectClaim")}
              </Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              {t("previous")}
            </Button>
            <Button disabled={page * 25 >= queue.data.count} onClick={() => setPage((p) => p + 1)}>
              {t("next")}
            </Button>
          </div>
        </>
      )}
      {claimId && (
        <Button
          disabled={claim.isPending}
          onClick={() =>
            claim.mutate(undefined, {
              onSuccess: () => {
                setSelected(claimId);
                setClaimId("");
              },
            })
          }
        >
          {t("claim")}
        </Button>
      )}
      {(claim.isError || detail.error) && <p role="alert">{t("error")}</p>}
      {detail.data && !detail.error && (
        <RevisionRecord key={detail.data.id} userId={userId} revision={detail.data} review />
      )}
    </section>
  );
}

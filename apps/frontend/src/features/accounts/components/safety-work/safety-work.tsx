"use client";
import { useRetainedQueryData } from "../../hooks/use-retained-query-data";
import { PrivateQueryRegion } from "../private-query-region/private-query-region";
import { useProtectedSession } from "../protected-session-boundary/protected-session-context";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/shared/ui/button/button";
import { trustOptions } from "../../queries/trust.queries";
import { workPageSchema, timelineSchema } from "../../schemas/trust.schema";
import { useOnboardingMutation } from "../../hooks/use-onboarding-mutation";
import { writeTrust } from "../../api/trust.api";
import { onboardingUrl } from "../../api/onboarding.api";
import { z } from "zod";
import { TrustCommand } from "../trust-command/trust-command";
import type { SafetyWorkProps } from "./safety-work.types";
export function SafetyWork({ userId, owner, kind }: SafetyWorkProps) {
  const { authorized } = useProtectedSession();
  const t = useTranslations("accounts.trust");
  const format = useFormatter();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const list = useQuery({
    ...trustOptions(userId, "work", workPageSchema, "", page, kind),
    enabled: authorized,
  });
  const listData = useRetainedQueryData(
    list,
    trustOptions(userId, "work", workPageSchema, "", page, kind).queryKey,
  );
  const liveRow = list.data?.results.find((item) => item.target === selected);
  const row = listData?.results.find((item) => item.target === selected);
  const canReadTimeline = owner || liveRow?.assigned_to === userId;
  const timeline = useQuery({
    ...trustOptions(userId, "timeline", timelineSchema, selected, historyPage, kind),
    enabled: authorized && !!selected && canReadTimeline,
  });
  const timelineData = useRetainedQueryData(
    timeline,
    trustOptions(userId, "timeline", timelineSchema, selected, historyPage, kind).queryKey,
  );
  const claim = useOnboardingMutation(userId, () =>
    writeTrust("work-claim", selected, { reason: t("claimReason") }, kind),
  );
  return (
    <PrivateQueryRegion
      masked={
        list.isFetching ||
        list.isError ||
        (!!selected &&
          canReadTimeline &&
          (timeline.isPending || timeline.isFetching || timeline.isError))
      }
      error={list.isError || timeline.isError ? t("error") : undefined}
      retry={() => {
        void list.refetch();
        if (selected) void timeline.refetch();
      }}
    >
      <section className="flex flex-col gap-4">
        <h3>{t(kind)}</h3>
        {!listData ? (
          <p>{t("loading")}</p>
        ) : list.isError && !listData ? (
          <Button onClick={() => void list.refetch()}>{t("retry")}</Button>
        ) : (
          <>
            {!listData.results.length && <p>{t("empty")}</p>}
            {listData.results.map((item) => (
              <div key={item.target} className="flex flex-wrap gap-2">
                <p dir="auto">{item.reason}</p>
                <span>{t(`statuses.${item.status}`)}</span>
                <Button
                  onClick={() => {
                    setSelected(item.target);
                    setHistoryPage(1);
                  }}
                >
                  {t("open")}
                </Button>
              </div>
            ))}
            <div className="flex gap-2">
              <Button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                {t("previous")}
              </Button>
              <Button disabled={page * 25 >= listData.count} onClick={() => setPage((p) => p + 1)}>
                {t("next")}
              </Button>
            </div>
          </>
        )}
        {selected && (
          <>
            {!owner &&
              row &&
              ["pending", "proposed", "active"].includes(row.status) &&
              !row.assigned_to && (
                <Button disabled={claim.isPending} onClick={() => claim.mutate()}>
                  {t("claim")}
                </Button>
              )}
            {(claim.isError || timeline.error) && <p role="alert">{t("error")}</p>}
            {timelineData && canReadTimeline && (
              <>
                <h4>{t("history")}</h4>
                {Object.entries(timelineData.data.details)
                  .filter(
                    ([key, value]) =>
                      ["business_id", "user_id", "order_id", "stage", "decision"].includes(key) &&
                      typeof value === "string",
                  )
                  .map(([key, value]) => (
                    <p key={key}>
                      {t(`details.${key}`)}:{" "}
                      <bdi>
                        {key === "stage" || key === "decision"
                          ? t(`statuses.${String(value)}`)
                          : String(value)}
                      </bdi>
                    </p>
                  ))}
                {(z.array(z.uuid()).safeParse(timelineData.data.details.evidence).data ?? []).map(
                  (file) => (
                    <a
                      key={file}
                      href={onboardingUrl("content", file)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t("evidence")} · <bdi>{file}</bdi>
                    </a>
                  ),
                )}
                {timelineData.data.history.results.map((event) => (
                  <p key={event.id} dir="auto">
                    {format.dateTime(new Date(event.created_at), {
                      calendar: "persian",
                      timeZone: "Asia/Tehran",
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                    })}{" "}
                    · {event.reason} · {t("actor")}: <bdi>{event.actor_id}</bdi>
                  </p>
                ))}
                <div className="flex gap-2">
                  <Button disabled={historyPage === 1} onClick={() => setHistoryPage((p) => p - 1)}>
                    {t("previous")}
                  </Button>
                  <Button
                    disabled={historyPage * 25 >= timelineData.data.history.count}
                    onClick={() => setHistoryPage((p) => p + 1)}
                  >
                    {t("next")}
                  </Button>
                </div>
                {owner && row && (
                  <TrustCommand
                    key={`${selected}:${row.status}`}
                    userId={userId}
                    targetId={selected}
                    kind={kind}
                    commands={row.commands.filter((c) =>
                      (kind === "disposition" && row.status === "pending") ||
                      row.status === "proposed"
                        ? [
                            "suspension_activate",
                            "suspension_reject",
                            "disposition_decide",
                          ].includes(c)
                        : row.status === "active" && c === "suspension_restore",
                    )}
                  />
                )}
              </>
            )}
          </>
        )}
      </section>
    </PrivateQueryRegion>
  );
}

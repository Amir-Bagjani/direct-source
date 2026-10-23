"use client";
import { useRetainedQueryData } from "@/shared/hooks/use-retained-query-data";
import { PrivateQueryRegion } from "@/shared/ui/private-query-region/private-query-region";
import { useProtectedSession } from "../protected-session-boundary/protected-session-context";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/ui/button/button";
import { trustOptions } from "../../queries/trust.queries";
import { revisionPageSchema } from "../../schemas/trust.schema";
import { RevisionEditor } from "../revision-editor/revision-editor";
import { RevisionRecord } from "../revision-record/revision-record";
import type { BusinessRevisionsProps } from "./business-revisions.types";
export function BusinessRevisions(props: BusinessRevisionsProps) {
  const { authorized } = useProtectedSession();
  const t = useTranslations("accounts.trust");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(false);
  const query = useQuery({
    ...trustOptions(props.userId, "revisions", revisionPageSchema, props.business.id, page),
    enabled: authorized,
  });
  const data = useRetainedQueryData(
    query,
    trustOptions(props.userId, "revisions", revisionPageSchema, props.business.id, page).queryKey,
  );
  if (query.isPending && !data) return <p role="status">{t("loading")}</p>;
  if (query.isError && !data)
    return <Button onClick={() => void query.refetch()}>{t("retry")}</Button>;
  if (!data) return null;
  const open = data.results.find((r) => ["pending", "changes_requested"].includes(r.status));
  if (!data) return null;
  return (
    <PrivateQueryRegion
      masked={query.isPending || query.isError}
      error={query.isError ? t("error") : undefined}
      retry={() => void query.refetch()}
    >
      <section className="flex flex-col gap-4">
        <h3>{t("revisions")}</h3>
        {page === 1 &&
          props.business.status === "verified" &&
          (!open || open.status === "changes_requested") && (
            <>
              <Button variant="outline" onClick={() => setEditing((v) => !v)}>
                {t(editing ? "close" : "editRevision")}
              </Button>
              {editing && (
                <RevisionEditor
                  key={open?.id ?? "new"}
                  {...props}
                  {...(open ? { revision: open } : {})}
                />
              )}
            </>
          )}
        {!data.results.length && <p>{t("empty")}</p>}
        {data.results.map((revision) => (
          <RevisionRecord key={revision.id} userId={props.userId} revision={revision} />
        ))}
        <div className="flex gap-2">
          <Button variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
            {t("previous")}
          </Button>
          <Button
            variant="outline"
            disabled={page * 25 >= data.count}
            onClick={() => setPage((p) => p + 1)}
          >
            {t("next")}
          </Button>
        </div>
      </section>
    </PrivateQueryRegion>
  );
}

"use client";
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
  const t = useTranslations("accounts.trust");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(false);
  const query = useQuery(
    trustOptions(props.userId, "revisions", revisionPageSchema, props.business.id, page),
  );
  if (query.isPending) return <p role="status">{t("loading")}</p>;
  if (query.isError) return <Button onClick={() => void query.refetch()}>{t("retry")}</Button>;
  const open = query.data.results.find((r) => ["pending", "changes_requested"].includes(r.status));
  return (
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
      {!query.data.results.length && <p>{t("empty")}</p>}
      {query.data.results.map((revision) => (
        <RevisionRecord key={revision.id} userId={props.userId} revision={revision} />
      ))}
      <div className="flex gap-2">
        <Button variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
          {t("previous")}
        </Button>
        <Button
          variant="outline"
          disabled={page * 25 >= query.data.count}
          onClick={() => setPage((p) => p + 1)}
        >
          {t("next")}
        </Button>
      </div>
    </section>
  );
}

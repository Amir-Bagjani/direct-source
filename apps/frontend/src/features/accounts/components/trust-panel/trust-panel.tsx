"use client";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ApiError } from "@/shared/api/unwrap";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/ui/card/card";
import { Button } from "@/shared/ui/button/button";
import { trustOptions } from "../../queries/trust.queries";
import { trustAccessSchema } from "../../schemas/trust.schema";
import { RevisionReview } from "../revision-review/revision-review";
import { AccountControls } from "../account-controls/account-controls";
import { SafetyWork } from "../safety-work/safety-work";
import type { TrustPanelProps } from "./trust-panel.types";
export function TrustPanel({ userId }: TrustPanelProps) {
  const t = useTranslations("accounts.trust");
  const query = useQuery(trustOptions(userId, "access", trustAccessSchema));
  if (query.error instanceof ApiError && query.error.status === 403) return null;
  if (query.isPending) return null;
  if (query.isError) return <Button onClick={() => void query.refetch()}>{t("retry")}</Button>;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("title")}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <RevisionReview userId={userId} />
        <AccountControls userId={userId} owner={query.data.owner} />
        <SafetyWork userId={userId} owner={query.data.owner} kind="suspension" />
        <SafetyWork userId={userId} owner={query.data.owner} kind="disposition" />
      </CardContent>
    </Card>
  );
}

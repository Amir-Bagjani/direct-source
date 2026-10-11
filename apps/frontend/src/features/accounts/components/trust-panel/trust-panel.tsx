"use client";
import { useTranslations } from "next-intl";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/ui/card/card";
import { RevisionReview } from "../revision-review/revision-review";
import { AccountControls } from "../account-controls/account-controls";
import { SafetyWork } from "../safety-work/safety-work";
import type { TrustPanelProps } from "./trust-panel.types";
export function TrustPanel({ userId, owner }: TrustPanelProps) {
  const t = useTranslations("accounts.trust");
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("title")}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <RevisionReview userId={userId} />
        <AccountControls userId={userId} owner={owner} />
        <SafetyWork userId={userId} owner={owner} kind="suspension" />
        <SafetyWork userId={userId} owner={owner} kind="disposition" />
      </CardContent>
    </Card>
  );
}

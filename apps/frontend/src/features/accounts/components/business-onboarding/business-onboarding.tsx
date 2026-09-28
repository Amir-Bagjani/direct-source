"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Button } from "@/shared/ui/button/button";
import { Alert, AlertDescription } from "@/shared/ui/alert/alert";
import { sectionsOptions } from "../../queries/onboarding.queries";
import { useOnboardingMutation } from "../../hooks/use-onboarding-mutation";
import { writeOnboarding, onboardingUrl } from "../../api/onboarding.api";
import { AccountHistory } from "../account-history/account-history";
import { BusinessRevisions } from "../business-revisions/business-revisions";
import { BusinessForm } from "../business-form/business-form";
import { VerificationSectionForm } from "../verification-section/verification-section";
import type { BusinessOnboardingProps } from "./business-onboarding.types";
export function BusinessOnboarding({ userId, business }: BusinessOnboardingProps) {
  const t = useTranslations("accounts.onboarding");
  const [editing, setEditing] = useState(false);
  const sections = useQuery(sectionsOptions(userId, business.id));
  const submit = useOnboardingMutation(userId, () => writeOnboarding("submit", business.id));
  const canEdit =
    business.status === "draft" ||
    (business.status === "changes_requested" &&
      sections.data?.some((s) => s.kind === "activity" && s.status === "changes_requested"));
  return (
    <div className="flex flex-col gap-6">
      {business.logo && (
        <Image
          src={onboardingUrl("content", business.logo)}
          alt={t("logo")}
          width={128}
          height={128}
          unoptimized
        />
      )}
      {canEdit &&
        (editing ? (
          <>
            <BusinessForm
              userId={userId}
              initialBusiness={business}
              onSaved={() => setEditing(false)}
              onCheck={() => void sections.refetch()}
            />
            <Button variant="outline" onClick={() => setEditing(false)}>
              {t("cancel")}
            </Button>
          </>
        ) : (
          <Button variant="outline" onClick={() => setEditing(true)}>
            {t("editProfile")}
          </Button>
        ))}
      {sections.isPending ? (
        <p role="status">{t("loading")}</p>
      ) : sections.isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            {t("loadError")}
            <Button onClick={() => void sections.refetch()}>{t("retry")}</Button>
          </AlertDescription>
        </Alert>
      ) : (
        sections.data?.map((section) => (
          <VerificationSectionForm
            key={`${section.kind}:${section.status}`}
            userId={userId}
            businessId={business.id}
            section={section}
            editable={
              ["draft", "changes_requested"].includes(business.status) &&
              ["draft", "changes_requested"].includes(section.status)
            }
          />
        ))
      )}
      {["draft", "changes_requested"].includes(business.status) && (
        <Button
          disabled={
            submit.isPending ||
            !sections.data?.every((s) => s.status === "approved" || Object.keys(s.data).length > 0)
          }
          onClick={() => submit.mutate()}
        >
          {t("submit")}
        </Button>
      )}
      {sections.data && ["verified", "suspended"].includes(business.status) && (
        <BusinessRevisions userId={userId} business={business} sections={sections.data} />
      )}
      {["verified", "suspended"].includes(business.status) && (
        <AccountHistory userId={userId} restricted={business.status === "suspended"} />
      )}
      {submit.isError && (
        <Alert variant="destructive">
          <AlertDescription>{t("submitError")}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

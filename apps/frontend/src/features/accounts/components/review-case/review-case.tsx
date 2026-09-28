"use client";
import { SuspensionProposal } from "../suspension-proposal/suspension-proposal";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Field, FieldLabel, FieldGroup } from "@/shared/ui/field/field";
import { Textarea } from "@/shared/ui/textarea/textarea";
import { NativeSelect, NativeSelectOption } from "@/shared/ui/native-select/native-select";
import { Button } from "@/shared/ui/button/button";
import { sectionsOptions, businessDetailOptions } from "../../queries/onboarding.queries";
import { useOnboardingMutation } from "../../hooks/use-onboarding-mutation";
import { writeOnboarding, onboardingUrl } from "../../api/onboarding.api";
import { reviewSchema, reasonSchema } from "../../schemas/onboarding.schema";
import { VerificationSectionForm } from "../verification-section/verification-section";
import type { ReviewCaseProps } from "./review-case.types";
export function ReviewCase({ userId, businessId }: ReviewCaseProps) {
  const t = useTranslations("accounts.onboarding");
  const sections = useQuery(sectionsOptions(userId, businessId));
  const business = useQuery(businessDetailOptions(userId, businessId));
  const [kind, setKind] = useState("identity");
  const [decision, setDecision] = useState("approved");
  const [reason, setReason] = useState("");
  const mutation = useOnboardingMutation(userId, () =>
    business.data?.status === "rejected"
      ? writeOnboarding("reopen", businessId, reasonSchema.parse({ reason }))
      : writeOnboarding("review", businessId, reviewSchema.parse({ kind, decision, reason })),
  );
  if (sections.isPending || business.isPending) return <p role="status">{t("loading")}</p>;
  if (sections.isError || business.isError)
    return (
      <>
        <p role="alert">{t("loadError")}</p>
        <Button
          onClick={() => {
            void sections.refetch();
            void business.refetch();
          }}
        >
          {t("retry")}
        </Button>
      </>
    );
  return (
    <section className="flex flex-col gap-4">
      <h3>
        <bdi>{business.data.name}</bdi>
      </h3>
      <p dir="auto">{business.data.description}</p>
      {business.data.logo && (
        <Image
          src={onboardingUrl("content", business.data.logo)}
          alt={t("logo")}
          width={128}
          height={128}
          unoptimized
        />
      )}
      {business.data.addresses.map((address) => (
        <p key={address.id} dir="auto">
          {address.province}، {address.city}، {address.address}
        </p>
      ))}
      {sections.data.map((section) => (
        <VerificationSectionForm
          key={`${businessId}:${section.kind}:${section.status}`}
          userId={userId}
          businessId={businessId}
          section={section}
          editable={false}
        />
      ))}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate(undefined, { onSuccess: () => setReason("") });
        }}
      >
        <FieldGroup>
          {business.data.status !== "rejected" && (
            <>
              <Field>
                <FieldLabel htmlFor="review-kind">{t("section")}</FieldLabel>
                <NativeSelect
                  id="review-kind"
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                >
                  <NativeSelectOption value="identity">{t("identity")}</NativeSelectOption>
                  <NativeSelectOption value="activity">{t("activity")}</NativeSelectOption>
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="review-decision">{t("decision")}</FieldLabel>
                <NativeSelect
                  id="review-decision"
                  value={decision}
                  onChange={(e) => setDecision(e.target.value)}
                >
                  {(["approved", "changes_requested", "rejected"] as const).map((value) => (
                    <NativeSelectOption key={value} value={value}>
                      {t(`statuses.${value}`)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            </>
          )}
          <Field>
            <FieldLabel htmlFor="review-reason">{t("reason")}</FieldLabel>
            <Textarea
              id="review-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              maxLength={2000}
            />
          </Field>
          <Button
            type="submit"
            disabled={
              mutation.isPending ||
              (business.data.status !== "rejected" &&
                !sections.data.some((s) => s.kind === kind && s.status === "pending"))
            }
          >
            {t(business.data.status === "rejected" ? "reopen" : "review")}
          </Button>
          {mutation.isError && <p role="alert">{t("saveError")}</p>}
          {mutation.isSuccess && <p role="status">{t("saved")}</p>}
        </FieldGroup>
      </form>
      <SuspensionProposal userId={userId} businessId={businessId} />
    </section>
  );
}

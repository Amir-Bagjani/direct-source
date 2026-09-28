"use client";
import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/shared/ui/button/button";
import { Field, FieldLabel, FieldGroup } from "@/shared/ui/field/field";
import { NativeSelect, NativeSelectOption } from "@/shared/ui/native-select/native-select";
import { Textarea } from "@/shared/ui/textarea/textarea";
import { VerificationSectionForm } from "../verification-section/verification-section";
import { useOnboardingMutation } from "../../hooks/use-onboarding-mutation";
import { writeTrust } from "../../api/trust.api";
import { reviewSchema } from "../../schemas/onboarding.schema";
import { onboardingUrl } from "../../api/onboarding.api";
import type { RevisionRecordProps } from "./revision-record.types";
export function RevisionRecord({ userId, revision, review = false }: RevisionRecordProps) {
  const t = useTranslations("accounts.trust");
  const format = useFormatter();
  const [version, setVersion] = useState<"before" | "proposed">("proposed");
  const [kind, setKind] = useState("identity");
  const [decision, setDecision] = useState("approved");
  const [reason, setReason] = useState("");
  const data = revision[version];
  const mutation = useOnboardingMutation(userId, () =>
    writeTrust("revision-review", revision.id, reviewSchema.parse({ kind, decision, reason })),
  );
  return (
    <section className="flex flex-col gap-4">
      <p>
        {t(`statuses.${revision.status}`)} ·{" "}
        {format.dateTime(new Date(revision.created_at), {
          calendar: "persian",
          timeZone: "Asia/Tehran",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        })}
      </p>
      <Field>
        <FieldLabel htmlFor={`version-${revision.id}`}>{t("version")}</FieldLabel>
        <NativeSelect
          id={`version-${revision.id}`}
          value={version}
          onChange={(e) => setVersion(e.target.value === "before" ? "before" : "proposed")}
        >
          <NativeSelectOption value="before">{t("before")}</NativeSelectOption>
          <NativeSelectOption value="proposed">{t("proposed")}</NativeSelectOption>
        </NativeSelect>
      </Field>
      <dl className="grid gap-2">
        <dt>{t("profile")}</dt>
        <dd dir="auto">{data.profile.name}</dd>
        <dd dir="auto">{data.profile.description}</dd>
        <dd dir="auto">
          {data.profile.address.province}، {data.profile.address.city}،{" "}
          {data.profile.address.address}
        </dd>
        <dd>
          <bdi>{data.profile.phone}</bdi>
        </dd>
      </dl>
      {data.profile.logo && (
        <a href={onboardingUrl("content", data.profile.logo)} target="_blank" rel="noreferrer">
          {t("logo")}
        </a>
      )}
      {(["identity", "activity"] as const).map((section) => (
        <VerificationSectionForm
          key={`${version}:${section}`}
          userId={userId}
          businessId={revision.business_id}
          editable={false}
          section={{
            kind: section,
            status: revision[`${section}_status`],
            reason: revision[`${section}_reason`],
            data: data[section],
          }}
        />
      ))}
      {review && ["pending", "changes_requested"].includes(revision.status) && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(undefined, { onSuccess: () => setReason("") });
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="revision-review-kind">{t("section")}</FieldLabel>
              <NativeSelect
                id="revision-review-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                {(["identity", "activity"] as const).map((k) => (
                  <NativeSelectOption key={k} value={k}>
                    {t(k)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="revision-decision">{t("decision")}</FieldLabel>
              <NativeSelect
                id="revision-decision"
                value={decision}
                onChange={(e) => setDecision(e.target.value)}
              >
                {(["approved", "changes_requested", "rejected"] as const).map((d) => (
                  <NativeSelectOption key={d} value={d}>
                    {t(`statuses.${d}`)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="revision-reason">{t("reason")}</FieldLabel>
              <Textarea
                id="revision-reason"
                required
                maxLength={2000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <Button
              type="submit"
              disabled={
                mutation.isPending ||
                (kind === "identity" ? revision.identity_status : revision.activity_status) !==
                  "pending"
              }
            >
              {t("review")}
            </Button>
            {mutation.isError && <p role="alert">{t("error")}</p>}
          </FieldGroup>
        </form>
      )}
    </section>
  );
}

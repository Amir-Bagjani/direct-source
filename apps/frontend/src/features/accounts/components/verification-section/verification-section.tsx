"use client";
import { fromJalaliBirthDate, toJalaliBirthDate } from "../../utils/birth-date";
import { useState, useId } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/ui/button/button";
import { Input } from "@/shared/ui/input/input";
import { NativeSelect, NativeSelectOption } from "@/shared/ui/native-select/native-select";
import {
  FieldSet,
  FieldLegend,
  FieldGroup,
  Field,
  FieldLabel,
  FieldDescription,
} from "@/shared/ui/field/field";
import { Alert, AlertDescription } from "@/shared/ui/alert/alert";
import { useOnboardingMutation } from "../../hooks/use-onboarding-mutation";
import { writeOnboarding } from "../../api/onboarding.api";
import { identitySchema, activitySchema } from "../../schemas/onboarding.schema";
import { DocumentUpload } from "../document-upload/document-upload";
import type { VerificationSectionProps } from "./verification-section.types";
export function VerificationSectionForm({
  userId,
  businessId,
  section,
  editable,
  prepareRevision,
  onSaved,
}: VerificationSectionProps) {
  const id = useId();
  const t = useTranslations("accounts.onboarding");
  const w = useTranslations("accounts.workspace");
  const [invalid, setInvalid] = useState(false);
  const identity = identitySchema.safeParse(section.data);
  const activity = activitySchema.safeParse(section.data);
  const [nationalId, setNationalId] = useState(identity.success ? identity.data.national_id : "");
  const [birth, setBirth] = useState(
    identity.success ? toJalaliBirthDate(identity.data.birth_date) : "",
  );
  const [front, setFront] = useState<string[]>(identity.success ? [identity.data.card_front] : []);
  const [back, setBack] = useState<string[]>(identity.success ? [identity.data.card_back] : []);
  const [selfie, setSelfie] = useState<string[]>(identity.success ? [identity.data.selfie] : []);
  const [files, setFiles] = useState<string[]>(activity.success ? activity.data.files : []);
  const [evidence, setEvidence] = useState<"license" | "alternative">(
    activity.success ? activity.data.evidence_type : "license",
  );
  const mutation = useOnboardingMutation(userId, async () => {
    const data =
      section.kind === "identity"
        ? identitySchema.parse({
            national_id: nationalId,
            birth_date: fromJalaliBirthDate(birth),
            card_front: front[0],
            card_back: back[0],
            selfie: selfie[0],
          })
        : activitySchema.parse({ evidence_type: evidence, files });
    if (prepareRevision) await prepareRevision(data);
    else await writeOnboarding(section.kind, businessId, data);
  });
  const disabled = !editable || mutation.isPending;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled) return;
        let valid = false;
        if (section.kind === "identity") {
          try {
            valid = identitySchema.safeParse({
              national_id: nationalId,
              birth_date: fromJalaliBirthDate(birth),
              card_front: front[0],
              card_back: back[0],
              selfie: selfie[0],
            }).success;
          } catch {
            valid = false;
          }
        } else valid = activitySchema.safeParse({ evidence_type: evidence, files }).success;
        setInvalid(!valid);
        if (valid) mutation.mutate(undefined, { onSuccess: () => onSaved?.() });
      }}
    >
      <FieldSet disabled={mutation.isPending}>
        <FieldLegend>{t(section.kind)}</FieldLegend>
        <FieldDescription>{t(`statuses.${section.status}`)}</FieldDescription>
        {section.reason && <p dir="auto">{section.reason}</p>}
        <FieldGroup>
          {section.kind === "identity" ? (
            <>
              <Field>
                <FieldLabel htmlFor={`${id}-national-id`}>{t("nationalId")}</FieldLabel>
                <Input
                  id={`${id}-national-id`}
                  value={nationalId}
                  onChange={(e) => setNationalId(e.target.value)}
                  maxLength={10}
                  required
                  disabled={disabled}
                  dir="ltr"
                  inputMode="numeric"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${id}-birth-date`}>{t("birthDate")}</FieldLabel>
                <FieldDescription>{t("birthHint")}</FieldDescription>
                <Input
                  id={`${id}-birth-date`}
                  type="text"
                  dir="ltr"
                  placeholder="1370/01/01"
                  maxLength={10}
                  value={birth}
                  onChange={(e) => setBirth(e.target.value)}
                  required
                  disabled={disabled}
                />
              </Field>
              <DocumentUpload
                targetId={businessId}
                purpose="identity"
                value={front}
                onChange={setFront}
                label={t("cardFront")}
                max={1}
                disabled={disabled}
              />
              <DocumentUpload
                targetId={businessId}
                purpose="identity"
                value={back}
                onChange={setBack}
                label={t("cardBack")}
                max={1}
                disabled={disabled}
              />
              <DocumentUpload
                targetId={businessId}
                purpose="identity"
                value={selfie}
                onChange={setSelfie}
                label={t("selfie")}
                max={1}
                disabled={disabled}
              />
            </>
          ) : (
            <>
              <Field>
                <FieldLabel htmlFor={`${id}-evidence-type`}>{t("evidenceType")}</FieldLabel>
                <NativeSelect
                  id={`${id}-evidence-type`}
                  value={evidence}
                  onChange={(e) =>
                    setEvidence(e.target.value === "alternative" ? "alternative" : "license")
                  }
                  disabled={disabled}
                >
                  <NativeSelectOption value="license">{t("license")}</NativeSelectOption>
                  <NativeSelectOption value="alternative">{t("alternative")}</NativeSelectOption>
                </NativeSelect>
                <FieldDescription>{t("alternativeHint")}</FieldDescription>
              </Field>
              <DocumentUpload
                targetId={businessId}
                purpose="activity"
                value={files}
                onChange={setFiles}
                label={t("activityFiles")}
                max={10}
                disabled={disabled}
              />
            </>
          )}
          {editable && (
            <Button type="submit" disabled={disabled}>
              {onSaved ? w("saveContinue") : t(prepareRevision ? "prepareRevision" : "saveSection")}
            </Button>
          )}
          {invalid && (
            <Alert variant="destructive">
              <AlertDescription>
                {w(section.kind === "identity" ? "invalidIdentity" : "invalidActivity")}
              </AlertDescription>
            </Alert>
          )}
          {mutation.isError && (
            <Alert variant="destructive">
              <AlertDescription>{t("saveError")}</AlertDescription>
            </Alert>
          )}
          {mutation.isSuccess && <p role="status">{t("saved")}</p>}
        </FieldGroup>
      </FieldSet>
    </form>
  );
}

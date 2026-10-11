"use client";
import { useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Input } from "@/shared/ui/input/input";
import { Button } from "@/shared/ui/button/button";
import { Checkbox } from "@/shared/ui/checkbox/checkbox";
import { Field, FieldLabel, FieldDescription } from "@/shared/ui/field/field";
import { Alert, AlertDescription } from "@/shared/ui/alert/alert";
import { Spinner } from "@/shared/ui/spinner/spinner";
import { policyOptions } from "../../queries/onboarding.queries";
import { useDocumentUpload } from "../../hooks/use-document-upload";
import { onboardingUrl } from "../../api/onboarding.api";
import type { DocumentUploadProps } from "./document-upload.types";
export function DocumentUpload({
  targetId,
  purpose,
  value,
  onChange,
  label,
  max,
  disabled = false,
}: DocumentUploadProps) {
  const t = useTranslations("accounts.onboarding");
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [consent, setConsent] = useState(false);
  const [validFile, setValidFile] = useState(false);
  const [invalidFile, setInvalidFile] = useState(false);
  const policy = useQuery(policyOptions());
  const upload = useDocumentUpload(
    () => {
      const file = input.current?.files?.[0];
      if (!file || !consent || !policy.data) throw new Error("file_required");
      return [targetId, file, purpose, policy.data.consent_version];
    },
    (fileId) => {
      onChange([...value, fileId]);
      if (input.current) input.current.value = "";
      setValidFile(false);
    },
  );
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {value.map((file, index) => (
        <div key={file} className="flex flex-wrap items-center gap-2">
          <a href={onboardingUrl("content", file)} target="_blank" rel="noreferrer">
            {t("viewFile", { number: index + 1 })}
          </a>
          {!disabled && (
            <Button
              variant="outline"
              size="sm"
              disabled={upload.isPending}
              onClick={() => onChange(value.filter((v) => v !== file))}
            >
              {t("remove")}
            </Button>
          )}
        </div>
      ))}
      {!disabled && value.length < max && (
        <>
          <FieldDescription id={`${id}-limit`}>
            {t(purpose === "business_logo" ? "logoLimit" : "fileLimit")}
          </FieldDescription>
          <Input
            id={id}
            ref={input}
            type="file"
            accept={
              purpose === "business_logo"
                ? "image/jpeg,image/png,image/webp"
                : "image/jpeg,image/png,image/webp,application/pdf"
            }
            disabled={upload.isPending}
            aria-invalid={invalidFile}
            aria-describedby={`${id}-limit`}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              const limit = (purpose === "business_logo" ? 5 : 10) * 1024 * 1024;
              const accepted =
                !!file &&
                file.size > 0 &&
                file.size <= limit &&
                /\.(jpe?g|png|webp|pdf)$/i.test(file.name) &&
                (purpose !== "business_logo" || !/\.pdf$/i.test(file.name));
              setValidFile(accepted);
              setInvalidFile(!!file && !accepted);
            }}
          />
          <Field orientation="horizontal">
            <Checkbox
              id={`${id}-consent`}
              checked={consent}
              onCheckedChange={setConsent}
              disabled={upload.isPending}
            />
            <FieldLabel htmlFor={`${id}-consent`}>
              {t(purpose === "support" || purpose === "suspension" ? "caseConsent" : "consent")}
            </FieldLabel>
          </Field>
          <FieldDescription>{t("retention")}</FieldDescription>
          <Button
            disabled={!validFile || !consent || !policy.data || upload.isPending}
            onClick={() => upload.mutate()}
          >
            {upload.isPending && <Spinner aria-hidden="true" />}
            {t("upload")}
          </Button>
          {invalidFile && (
            <Alert variant="destructive">
              <AlertDescription>
                {t(purpose === "business_logo" ? "logoLimit" : "fileLimit")}
              </AlertDescription>
            </Alert>
          )}
          {policy.isError && (
            <Button variant="outline" onClick={() => void policy.refetch()}>
              {t("retry")}
            </Button>
          )}
          {upload.isError && (
            <Alert variant="destructive">
              <AlertDescription>{t("uploadError")}</AlertDescription>
            </Alert>
          )}
        </>
      )}
    </Field>
  );
}

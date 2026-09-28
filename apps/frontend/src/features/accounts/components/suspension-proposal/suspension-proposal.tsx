"use client";
import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/ui/button/button";
import { Field, FieldGroup, FieldLabel, FieldDescription } from "@/shared/ui/field/field";
import { Textarea } from "@/shared/ui/textarea/textarea";
import { DocumentUpload } from "../document-upload/document-upload";
import { useOnboardingMutation } from "../../hooks/use-onboarding-mutation";
import { writeTrust } from "../../api/trust.api";
import { suspensionInputSchema } from "../../schemas/trust.schema";
import type { SuspensionProposalProps } from "./suspension-proposal.types";
export function SuspensionProposal({ userId, businessId }: SuspensionProposalProps) {
  const t = useTranslations("accounts.trust");
  const id = useId();
  const [reason, setReason] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const mutation = useOnboardingMutation(userId, () =>
    writeTrust(
      "suspension-propose",
      "",
      suspensionInputSchema.parse({ business_id: businessId, reason, evidence: files }),
    ),
  );
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate(undefined, {
          onSuccess: () => {
            setReason("");
            setFiles([]);
          },
        });
      }}
    >
      <FieldGroup>
        <FieldDescription>{t("proposalHint")}</FieldDescription>
        <Field>
          <FieldLabel htmlFor={id}>{t("proposalReason")}</FieldLabel>
          <Textarea
            id={id}
            required
            maxLength={2000}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        <DocumentUpload
          targetId={businessId}
          purpose="suspension"
          value={files}
          onChange={setFiles}
          label={t("evidence")}
          max={10}
        />
        <Button type="submit" disabled={mutation.isPending}>
          {t("suspendBusiness")}
        </Button>
        {mutation.isError && <p role="alert">{t("error")}</p>}
        {mutation.isSuccess && <p role="status">{t("completed")}</p>}
      </FieldGroup>
    </form>
  );
}

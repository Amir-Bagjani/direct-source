"use client";
import { useRetainedQueryData } from "../../hooks/use-retained-query-data";
import { PrivateQueryRegion } from "../private-query-region/private-query-region";
import { useProtectedSession } from "../protected-session-boundary/protected-session-context";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/ui/button/button";
import { Field, FieldGroup, FieldLabel, FieldSet } from "@/shared/ui/field/field";
import { Textarea } from "@/shared/ui/textarea/textarea";
import { NativeSelect, NativeSelectOption } from "@/shared/ui/native-select/native-select";
import { trustOptions } from "../../queries/trust.queries";
import { directorySchema, suspensionInputSchema } from "../../schemas/trust.schema";
import { useOnboardingMutation } from "../../hooks/use-onboarding-mutation";
import { writeTrust } from "../../api/trust.api";
import { DocumentUpload } from "../document-upload/document-upload";
import type { AccountControlsProps } from "./account-controls.types";
export function AccountControls({ userId, owner }: AccountControlsProps) {
  const { authorized } = useProtectedSession();
  const t = useTranslations("accounts.trust");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState("");
  const [action, setAction] = useState(owner ? "grant" : "suspendBusiness");
  const [reason, setReason] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const query = useQuery({
    ...trustOptions(userId, "directory", directorySchema, "", page),
    enabled: authorized,
  });
  const data = useRetainedQueryData(
    query,
    trustOptions(userId, "directory", directorySchema, "", page).queryKey,
  );
  const target = data?.results.find((row) => row.id === selected);
  const mutation = useOnboardingMutation(userId, () => {
    if (!target) throw new Error("target_required");
    if (action === "grantOperator" || action === "revokeOperator")
      return writeTrust("operator", target.id, { enabled: action === "grantOperator", reason });
    if (action === "grant" || action === "revoke") {
      if (!target.business) throw new Error("business_required");
      return writeTrust("controlled", target.business.id, { enabled: action === "grant", reason });
    }
    return writeTrust(
      "suspension-propose",
      "",
      suspensionInputSchema.parse({
        reason,
        evidence: files,
        ...(action === "suspendUser"
          ? { user_id: target.id }
          : { business_id: target.business?.id }),
      }),
    );
  });
  return (
    <PrivateQueryRegion
      masked={query.isPending || query.isError}
      error={query.isError && !data ? t("error") : undefined}
      retry={() => void query.refetch()}
    >
      <section className="flex flex-col gap-4">
        <h3>{t("accountControls")}</h3>
        {!data ? (
          <p>{t("loading")}</p>
        ) : query.isError && !data ? (
          <Button onClick={() => void query.refetch()}>{t("retry")}</Button>
        ) : (
          <>
            <Field>
              <FieldLabel htmlFor="trust-account">{t("account")}</FieldLabel>
              <NativeSelect
                id="trust-account"
                disabled={mutation.isPending}
                value={selected}
                onChange={(e) => {
                  setSelected(e.target.value);
                  setFiles([]);
                  setReason("");
                }}
              >
                <NativeSelectOption value="">{t("choose")}</NativeSelectOption>
                {data.results.map((row) => (
                  <NativeSelectOption key={row.id} value={row.id}>
                    {row.first_name} {row.last_name} — {row.business?.name ?? row.mobile}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <div className="flex gap-2">
              <Button
                disabled={mutation.isPending || page === 1}
                onClick={() => {
                  setPage((p) => p - 1);
                  setSelected("");
                }}
              >
                {t("previous")}
              </Button>
              <Button
                disabled={mutation.isPending || page * 25 >= data.count}
                onClick={() => {
                  setPage((p) => p + 1);
                  setSelected("");
                }}
              >
                {t("next")}
              </Button>
            </div>
            {target && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  mutation.mutate(undefined, {
                    onSuccess: () => {
                      setReason("");
                      setFiles([]);
                    },
                  });
                }}
              >
                <FieldSet disabled={mutation.isPending}>
                  <FieldGroup>
                    <p>{t(target.operator ? "operatorOn" : "operatorOff")}</p>
                    <p>{t(target.is_suspended ? "userSuspended" : "userActive")}</p>
                    {target.business && (
                      <p>
                        {t(target.business.controlled_access ? "controlledOn" : "controlledOff")}
                      </p>
                    )}
                    <Field>
                      <FieldLabel htmlFor="trust-action">{t("command")}</FieldLabel>
                      <NativeSelect
                        id="trust-action"
                        value={action}
                        onChange={(e) => setAction(e.target.value)}
                      >
                        {[
                          "grant",
                          "revoke",
                          "suspendUser",
                          "suspendBusiness",
                          "grantOperator",
                          "revokeOperator",
                        ]
                          .filter((action) => owner || action.startsWith("suspend"))
                          .map((a) => (
                            <NativeSelectOption
                              key={a}
                              value={a}
                              disabled={
                                ["grant", "revoke", "suspendBusiness"].includes(a) &&
                                !target.business
                              }
                            >
                              {t(a)}
                            </NativeSelectOption>
                          ))}
                      </NativeSelect>
                    </Field>
                    {action.startsWith("suspend") && target.business && (
                      <DocumentUpload
                        targetId={target.business.id}
                        purpose="suspension"
                        value={files}
                        onChange={setFiles}
                        label={t("evidence")}
                        max={10}
                      />
                    )}
                    <Field>
                      <FieldLabel htmlFor="trust-reason">{t("reason")}</FieldLabel>
                      <Textarea
                        id="trust-reason"
                        required
                        maxLength={2000}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </Field>
                    <Button type="submit" disabled={mutation.isPending}>
                      {t("execute")}
                    </Button>
                    {mutation.isError && <p role="alert">{t("error")}</p>}
                    {mutation.isSuccess && <p role="status">{t("completed")}</p>}
                  </FieldGroup>
                </FieldSet>
              </form>
            )}
          </>
        )}
      </section>
    </PrivateQueryRegion>
  );
}

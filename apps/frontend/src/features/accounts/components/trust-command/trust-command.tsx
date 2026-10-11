"use client";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/ui/button/button";
import { Field, FieldLabel, FieldGroup, FieldSet } from "@/shared/ui/field/field";
import { NativeSelect, NativeSelectOption } from "@/shared/ui/native-select/native-select";
import { Textarea } from "@/shared/ui/textarea/textarea";
import { useOnboardingMutation } from "../../hooks/use-onboarding-mutation";
import { writeTrust } from "../../api/trust.api";
import { commandSchema } from "../../schemas/trust.schema";
import type { TrustCommandProps } from "./trust-command.types";
export function TrustCommand({ userId, targetId, kind, commands }: TrustCommandProps) {
  const t = useTranslations("accounts.trust");
  const [command, setCommand] = useState(commands[0] ?? "");
  const [decision, setDecision] = useState("continue");
  const [reason, setReason] = useState("");
  const attempt = useRef({ body: "", key: "" });
  const mutation = useOnboardingMutation(userId, () => {
    const body = { command, reason, parameters: kind === "disposition" ? { decision } : {} };
    const signature = JSON.stringify(body);
    if (signature !== attempt.current.body)
      attempt.current = { body: signature, key: crypto.randomUUID() };
    return writeTrust(
      "work-command",
      targetId,
      commandSchema.parse({ ...body, idempotency_key: attempt.current.key }),
      kind,
    );
  });
  if (!commands.length) return null;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate(undefined, { onSuccess: () => setReason("") });
      }}
    >
      <FieldSet disabled={mutation.isPending}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`command-${targetId}`}>{t("command")}</FieldLabel>
            <NativeSelect
              id={`command-${targetId}`}
              value={command}
              onChange={(e) => setCommand(e.target.value)}
            >
              {commands.map((c) => (
                <NativeSelectOption key={c} value={c}>
                  {t(`commands.${c}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          {kind === "disposition" && (
            <Field>
              <FieldLabel htmlFor={`decision-${targetId}`}>{t("decision")}</FieldLabel>
              <NativeSelect
                id={`decision-${targetId}`}
                value={decision}
                onChange={(e) => setDecision(e.target.value)}
              >
                <NativeSelectOption value="continue">{t("continueOrder")}</NativeSelectOption>
                <NativeSelectOption value="cancel_refund">{t("cancelRefund")}</NativeSelectOption>
              </NativeSelect>
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor={`reason-${targetId}`}>{t("reason")}</FieldLabel>
            <Textarea
              id={`reason-${targetId}`}
              required
              maxLength={2000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <Button type="submit" disabled={mutation.isPending || !commands.includes(command)}>
            {t("execute")}
          </Button>
          {mutation.isError && <p role="alert">{t("error")}</p>}
          {mutation.isSuccess && <p role="status">{t("completed")}</p>}
        </FieldGroup>
      </FieldSet>
    </form>
  );
}

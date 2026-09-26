"use client";
import { accountKeys } from "../../queries/accounts.keys";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/shared/ui/button/button";
import { Input } from "@/shared/ui/input/input";
import {
  Field,
  FieldLabel,
  FieldError,
  FieldGroup,
  FieldSet,
  FieldDescription,
} from "@/shared/ui/field/field";
import { Alert, AlertDescription } from "@/shared/ui/alert/alert";
import { Spinner } from "@/shared/ui/spinner/spinner";
import { emailChangeSchema } from "../../schemas/recovery.schema";
import { useRecoveryMutation } from "../../hooks/use-recovery-mutation";
import type { EmailSettingsProps } from "./email-settings.types";
export function EmailSettings({ email, verified }: EmailSettingsProps) {
  const t = useTranslations("accounts.recovery");
  const client = useQueryClient();
  const form = useForm<z.input<typeof emailChangeSchema>>({
    resolver: zodResolver(emailChangeSchema),
    defaultValues: { email, current_password: "" },
  });
  const change = useRecoveryMutation("email", form.getValues);
  const resend = useRecoveryMutation("request-verification", () => ({}));
  return (
    <div className="flex flex-col gap-4">
      <form
        method="post"
        noValidate
        onSubmit={form.handleSubmit(() => {
          resend.reset();
          if (!change.isPending)
            change.mutate(undefined, {
              onSuccess: async () => {
                form.reset({ email: form.getValues("email"), current_password: "" });
                await client.invalidateQueries({ queryKey: accountKeys.sessions() });
              },
            });
        })}
      >
        <FieldSet disabled={!form.formState.isReady || change.isPending || resend.isPending}>
          <FieldGroup>
            <FieldDescription>{t("emailHelp")}</FieldDescription>
            {(["email", "current_password"] as const).map((name) => (
              <Field key={name} data-invalid={!!form.formState.errors[name]}>
                <FieldLabel htmlFor={`account-${name}`}>{t(name)}</FieldLabel>
                <Input
                  {...form.register(name)}
                  id={`account-${name}`}
                  dir="ltr"
                  type={name === "email" ? "email" : "password"}
                  autoComplete={name === "email" ? "email" : "current-password"}
                  maxLength={name === "email" ? 254 : 128}
                  required={name === "current_password"}
                  aria-invalid={!!form.formState.errors[name]}
                  aria-describedby={`account-${name}-error`}
                />
                <div id={`account-${name}-error`}>
                  {form.formState.errors[name] && (
                    <FieldError>{t(`validation.${name}`)}</FieldError>
                  )}
                </div>
              </Field>
            ))}
            <Button type="submit" disabled={change.isPending}>
              {change.isPending && <Spinner aria-hidden="true" />}
              {t("saveEmail")}
            </Button>
          </FieldGroup>
        </FieldSet>
      </form>
      {!!email && !verified && (
        <Button
          variant="outline"
          disabled={change.isPending || resend.isPending}
          onClick={() => {
            change.reset();
            resend.mutate();
          }}
        >
          {resend.isPending && <Spinner aria-hidden="true" />}
          {t("resend")}
        </Button>
      )}
      {(change.isSuccess || resend.isSuccess) && (
        <Alert role="status">
          <AlertDescription>
            {t(change.isSuccess ? "emailSaved" : "verificationRequested")}
          </AlertDescription>
        </Alert>
      )}
      {(change.isError || resend.isError) && (
        <Alert variant="destructive">
          <AlertDescription>{t("requestError")}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

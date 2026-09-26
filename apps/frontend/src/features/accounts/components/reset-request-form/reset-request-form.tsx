"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/shared/ui/button/button";
import { Input } from "@/shared/ui/input/input";
import { Field, FieldLabel, FieldError, FieldGroup, FieldSet } from "@/shared/ui/field/field";
import { Alert, AlertDescription } from "@/shared/ui/alert/alert";
import { Spinner } from "@/shared/ui/spinner/spinner";
import { resetRequestSchema } from "../../schemas/recovery.schema";
import { useRecoveryMutation } from "../../hooks/use-recovery-mutation";
export function ResetRequestForm() {
  const t = useTranslations("accounts.recovery");
  const form = useForm<z.input<typeof resetRequestSchema>>({
    resolver: zodResolver(resetRequestSchema),
    defaultValues: { email: "" },
  });
  const mutation = useRecoveryMutation("request-reset", form.getValues);
  return (
    <form
      method="post"
      noValidate
      onSubmit={form.handleSubmit(() => {
        if (!mutation.isPending) mutation.mutate();
      })}
    >
      <FieldSet disabled={!form.formState.isReady || mutation.isPending}>
        <FieldGroup>
          <Field data-invalid={!!form.formState.errors.email}>
            <FieldLabel htmlFor="reset-email">{t("email")}</FieldLabel>
            <Input
              {...form.register("email")}
              id="reset-email"
              type="email"
              dir="ltr"
              autoComplete="email"
              required
              maxLength={254}
              aria-invalid={!!form.formState.errors.email}
              aria-describedby="reset-email-error"
            />
            <div id="reset-email-error">
              {form.formState.errors.email && <FieldError>{t("validation.email")}</FieldError>}
            </div>
          </Field>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending && <Spinner aria-hidden="true" />}
            {t("requestReset")}
          </Button>
          {mutation.isSuccess && (
            <Alert role="status">
              <AlertDescription>{t("resetRequested")}</AlertDescription>
            </Alert>
          )}
          {mutation.isError && (
            <Alert variant="destructive">
              <AlertDescription>{t("requestError")}</AlertDescription>
            </Alert>
          )}
          <Link href="/login">{t("login")}</Link>
        </FieldGroup>
      </FieldSet>
    </form>
  );
}

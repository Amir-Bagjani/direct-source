"use client";
import { accountKeys } from "../../queries/accounts.keys";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@/i18n/navigation";
import { Button } from "@/shared/ui/button/button";
import { Input } from "@/shared/ui/input/input";
import { Field, FieldLabel, FieldError, FieldGroup, FieldSet } from "@/shared/ui/field/field";
import { Alert, AlertDescription } from "@/shared/ui/alert/alert";
import { Spinner } from "@/shared/ui/spinner/spinner";
import { newPasswordSchema } from "../../schemas/recovery.schema";
import { useRecoveryMutation } from "../../hooks/use-recovery-mutation";
import { announceSessionChange } from "../../client/session-events";
import type { ChallengeFormProps } from "./challenge-form.types";
export function ChallengeForm({ purpose, readToken, onComplete }: ChallengeFormProps) {
  const t = useTranslations("accounts.recovery");
  const client = useQueryClient();
  const reset = purpose === "reset";
  const form = useForm<z.input<typeof newPasswordSchema>>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: "" },
  });
  const mutation = useRecoveryMutation(reset ? "reset" : "confirm", () =>
    reset ? { token: readToken(), ...form.getValues() } : { token: readToken() },
  );
  function submit() {
    if (mutation.isPending) return;
    window.history.replaceState(window.history.state, "", window.location.pathname);
    mutation.mutate(undefined, {
      onSuccess: async () => {
        form.reset();
        onComplete();
        if (reset) {
          await client.cancelQueries();
          client.clear();
          announceSessionChange();
        } else await client.invalidateQueries({ queryKey: accountKeys.sessions() });
      },
    });
  }
  return (
    <form
      method="post"
      noValidate
      onSubmit={
        reset
          ? form.handleSubmit(submit)
          : (event) => {
              event.preventDefault();
              submit();
            }
      }
    >
      <FieldSet disabled={!form.formState.isReady || mutation.isPending}>
        <FieldGroup>
          {reset && (
            <Field data-invalid={!!form.formState.errors.password}>
              <FieldLabel htmlFor="new-password">{t("newPassword")}</FieldLabel>
              <Input
                {...form.register("password")}
                id="new-password"
                type="password"
                dir="ltr"
                required
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                aria-invalid={!!form.formState.errors.password}
                aria-describedby="new-password-error"
              />
              <div id="new-password-error">
                {form.formState.errors.password && (
                  <FieldError>{t("validation.password")}</FieldError>
                )}
              </div>
            </Field>
          )}
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending && <Spinner aria-hidden="true" />}
            {t(reset ? "savePassword" : "confirmEmail")}
          </Button>
          {mutation.isError && (
            <Alert variant="destructive">
              <AlertDescription>{t("consumeError")}</AlertDescription>
            </Alert>
          )}
          <Link href={reset ? "/forgot-password" : "/account"}>
            {t(reset ? "newLink" : "account")}
          </Link>
        </FieldGroup>
      </FieldSet>
    </form>
  );
}

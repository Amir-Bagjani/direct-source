"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@/i18n/navigation";
import { Button } from "@/shared/ui/button/button";
import { Input } from "@/shared/ui/input/input";
import { Field, FieldError, FieldGroup, FieldLabel, FieldSet } from "@/shared/ui/field/field";
import { Alert, AlertDescription } from "@/shared/ui/alert/alert";
import { Spinner } from "@/shared/ui/spinner/spinner";
import { loginSchema } from "../../schemas/login.schema";
import type { LoginInput } from "../../schemas/login.schema";
import { useLogin } from "../../hooks/use-session-mutations";
import { announceSessionChange } from "../../client/session-events";

export function LoginForm() {
  const t = useTranslations("accounts.login");
  const fields = useTranslations("accounts.register.fields");
  const locale = useLocale();
  const client = useQueryClient();
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { mobile: "", password: "" },
  });
  const mutation = useLogin(form.getValues, locale);
  return (
    <form
      method="post"
      noValidate
      onSubmit={form.handleSubmit(() => {
        if (mutation.isPending) return;
        mutation.mutate(undefined, {
          onSuccess: async () => {
            form.reset();
            await client.cancelQueries();
            client.clear();
            announceSessionChange();
            window.location.replace(`/${locale}/account`);
          },
        });
      })}
    >
      <FieldSet
        disabled={!form.formState.isReady || mutation.isPending}
        aria-busy={mutation.isPending}
      >
        <FieldGroup>
          {(["mobile", "password"] as const).map((name) => (
            <Field key={name} data-invalid={!!form.formState.errors[name]}>
              <FieldLabel htmlFor={`login-${name}`}>{fields(name)}</FieldLabel>
              <Input
                {...form.register(name)}
                id={`login-${name}`}
                dir="ltr"
                type={name === "mobile" ? "tel" : "password"}
                autoComplete={name === "mobile" ? "username" : "current-password"}
                required
                maxLength={name === "mobile" ? 32 : 128}
                aria-invalid={!!form.formState.errors[name]}
                aria-describedby={`login-${name}-error`}
              />
              <div id={`login-${name}-error`}>
                {form.formState.errors[name] && <FieldError>{t(`validation.${name}`)}</FieldError>}
              </div>
            </Field>
          ))}
          {mutation.isError && (
            <Alert variant="destructive">
              <AlertDescription>{t("error")}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" disabled={mutation.isPending} aria-busy={mutation.isPending}>
            {mutation.isPending && <Spinner aria-hidden="true" data-icon="inline-start" />}
            {t(mutation.isPending ? "pending" : "submit")}
          </Button>
          <Link href="/forgot-password">{t("forgotPassword")}</Link>
          <Link href="/register">{t("register")}</Link>
        </FieldGroup>
      </FieldSet>
    </form>
  );
}

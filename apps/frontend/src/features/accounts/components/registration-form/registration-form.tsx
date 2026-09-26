"use client";

import { useRef, useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ApiError } from "@/shared/api/unwrap";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert/alert";
import { Button } from "@/shared/ui/button/button";
import { buttonVariants } from "@/shared/ui/button/button.variants";
import { cn } from "@/shared/ui/cn";
import { Checkbox } from "@/shared/ui/checkbox/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@/shared/ui/field/field";
import { Input } from "@/shared/ui/input/input";
import { Spinner } from "@/shared/ui/spinner/spinner";
import { registrationSchema } from "../../schemas/registration.schema";
import type { RegistrationInput } from "../../schemas/registration.schema";
import { useRegistration } from "../../hooks/use-registration";

const textFields = [
  { name: "first_name", type: "text", autoComplete: "given-name", maxLength: 150 },
  { name: "last_name", type: "text", autoComplete: "family-name", maxLength: 150 },
  { name: "mobile", type: "tel", autoComplete: "tel", maxLength: 32 },
  { name: "email", type: "email", autoComplete: "email", maxLength: 254 },
  { name: "password", type: "password", autoComplete: "new-password", maxLength: 128 },
] as const;

export function RegistrationForm() {
  const t = useTranslations("accounts.register");
  const common = useTranslations("common");
  const resultRef = useRef<HTMLDivElement>(null);
  const form = useForm<RegistrationInput>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      first_name: "",
      last_name: "",
      mobile: "",
      email: "",
      password: "",
      accept_terms: false,
    },
  });
  const registration = useRegistration(form.getValues, () => form.reset());
  useEffect(() => {
    if (registration.isSuccess || registration.isError) resultRef.current?.focus();
  }, [registration.isSuccess, registration.isError]);

  if (registration.isSuccess) {
    return (
      <div className="flex flex-col gap-6">
        <Alert role="status" tabIndex={-1} ref={resultRef}>
          <AlertTitle>{t("successTitle")}</AlertTitle>
          <AlertDescription>{t("successDescription")}</AlertDescription>
        </Alert>
        <Link href="/login" className={cn(buttonVariants())}>
          {t("login")}
        </Link>
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
          {common("backHome")}
        </Link>
      </div>
    );
  }

  const errorKey =
    registration.error instanceof ApiError && registration.error.code === "registration_throttled"
      ? "throttled"
      : registration.error instanceof ApiError &&
          ["registration_rejected", "invalid_input"].includes(registration.error.code)
        ? "rejected"
        : "unavailable";

  return (
    <form
      method="post"
      noValidate
      onSubmit={form.handleSubmit(() => {
        if (!registration.isPending) registration.mutate();
      })}
    >
      <FieldSet
        disabled={!form.formState.isReady || registration.isPending}
        aria-busy={registration.isPending}
      >
        <FieldGroup>
          {textFields.map(({ name, type, autoComplete, maxLength }) => (
            <Field
              key={name}
              data-invalid={!!form.formState.errors[name]}
              data-disabled={registration.isPending}
            >
              <FieldLabel htmlFor={`register-${name}`}>{t(`fields.${name}`)}</FieldLabel>
              <Input
                {...form.register(name)}
                id={`register-${name}`}
                type={type}
                autoComplete={autoComplete}
                maxLength={maxLength}
                dir={type === "text" ? "auto" : "ltr"}
                required={name !== "email"}
                aria-invalid={!!form.formState.errors[name]}
                aria-describedby={`register-${name}-help`}
              />
              <div id={`register-${name}-help`}>
                {name === "password" && <FieldDescription>{t("passwordHelp")}</FieldDescription>}
                {name === "mobile" && (
                  <FieldDescription>
                    {t.rich("mobileHelp", {
                      number: (children) => <bdi dir="ltr">{children}</bdi>,
                    })}
                  </FieldDescription>
                )}
                {form.formState.errors[name] && <FieldError>{t(`validation.${name}`)}</FieldError>}
              </div>
            </Field>
          ))}
          <Controller
            name="accept_terms"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <Field orientation="horizontal">
                  <Checkbox
                    id="register-terms"
                    name={field.name}
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    onBlur={field.onBlur}
                    ref={field.ref}
                    required
                    disabled={registration.isPending}
                    aria-invalid={fieldState.invalid}
                    aria-describedby="register-policies register-terms-error"
                  />
                  <FieldLabel htmlFor="register-terms">{t("fields.accept_terms")}</FieldLabel>
                </Field>
                <FieldDescription id="register-policies">
                  {t.rich("readPolicies", {
                    terms: (children) => (
                      <Link href="/terms" target="_blank" rel="noopener noreferrer">
                        {children}
                      </Link>
                    ),
                    privacy: (children) => (
                      <Link href="/privacy" target="_blank" rel="noopener noreferrer">
                        {children}
                      </Link>
                    ),
                  })}
                </FieldDescription>
                <div id="register-terms-error">
                  {fieldState.invalid && <FieldError>{t("validation.accept_terms")}</FieldError>}
                </div>
              </Field>
            )}
          />
          {registration.isError && (
            <Alert variant="destructive" tabIndex={-1} ref={resultRef}>
              <AlertTitle>{t("errorTitle")}</AlertTitle>
              <AlertDescription>{t(`errors.${errorKey}`)}</AlertDescription>
            </Alert>
          )}
          <Button
            type="submit"
            disabled={registration.isPending}
            aria-busy={registration.isPending}
          >
            {registration.isPending && <Spinner aria-hidden="true" data-icon="inline-start" />}
            {t(registration.isPending ? "submitting" : "submit")}
          </Button>
        </FieldGroup>
      </FieldSet>
    </form>
  );
}

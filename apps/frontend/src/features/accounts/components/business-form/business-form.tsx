"use client";
import { useState } from "react";
import { DocumentUpload } from "../document-upload/document-upload";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { ApiError } from "@/shared/api/unwrap";
import { Button } from "@/shared/ui/button/button";
import { Input } from "@/shared/ui/input/input";
import { Textarea } from "@/shared/ui/textarea/textarea";
import { NativeSelect, NativeSelectOption } from "@/shared/ui/native-select/native-select";
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
import { businessInputSchema } from "../../schemas/business.schema";
import type { BusinessInput } from "../../schemas/business.schema";
import { useCreateBusiness } from "../../hooks/use-create-business";
import type { BusinessFormProps } from "./business-form.types";

export function BusinessForm({
  userId,
  onCheck,
  initialBusiness,
  onSaved,
  prepareRevision,
}: BusinessFormProps) {
  const t = useTranslations("accounts.business");
  const [logo, setLogo] = useState(initialBusiness?.logo ?? null);
  const form = useForm<BusinessInput>({
    resolver: zodResolver(businessInputSchema),
    defaultValues: initialBusiness
      ? {
          ...initialBusiness,
          address: initialBusiness.addresses[0] ?? { province: "", city: "", address: "" },
        }
      : {
          name: "",
          phone: "",
          description: "",
          address: { province: "", city: "", address: "" },
        },
  });
  const mutation = useCreateBusiness(
    userId,
    form.getValues,
    initialBusiness?.id,
    () => logo,
    prepareRevision,
  );
  return (
    <form
      method="post"
      noValidate
      onSubmit={form.handleSubmit(() => {
        if (!mutation.isPending) mutation.mutate(undefined, { onSuccess: () => onSaved?.() });
      })}
    >
      <FieldSet disabled={!form.formState.isReady || mutation.isPending}>
        <FieldDescription>{t("intro")}</FieldDescription>
        <FieldGroup>
          <Field data-invalid={!!form.formState.errors.kind}>
            <FieldLabel htmlFor="business-kind">{t("fields.kind")}</FieldLabel>
            <NativeSelect
              {...form.register("kind")}
              id="business-kind"
              disabled={!!initialBusiness}
              defaultValue={initialBusiness?.kind ?? ""}
              required
              aria-invalid={!!form.formState.errors.kind}
              aria-describedby="business-kind-error"
            >
              <NativeSelectOption value="" disabled>
                {t("chooseKind")}
              </NativeSelectOption>
              <NativeSelectOption value="manufacturer">
                {t("kinds.manufacturer")}
              </NativeSelectOption>
              <NativeSelectOption value="retailer">{t("kinds.retailer")}</NativeSelectOption>
            </NativeSelect>
            <div id="business-kind-error">
              {form.formState.errors.kind && <FieldError>{t("invalid")}</FieldError>}
            </div>
          </Field>
          {(
            [
              ["name", 200],
              ["phone", 16],
              ["address.province", 100],
              ["address.city", 100],
              ["address.address", 1000],
              ["description", 2000],
            ] as const
          ).map(([name, max]) => {
            const error = form.getFieldState(name, form.formState).error;
            const props = {
              ...form.register(name),
              id: `business-${name}`,
              required: true,
              maxLength: max,
              "aria-invalid": !!error,
              "aria-describedby": `business-${name}-error`,
            };
            return (
              <Field key={name} data-invalid={!!error}>
                <FieldLabel htmlFor={props.id}>{t(`fields.${name}`)}</FieldLabel>
                {name === "address.address" || name === "description" ? (
                  <Textarea {...props} dir="auto" rows={3} />
                ) : (
                  <Input
                    {...props}
                    dir={name === "phone" ? "ltr" : "auto"}
                    type={name === "phone" ? "tel" : "text"}
                    autoComplete={
                      name === "phone" ? "tel" : name === "name" ? "organization" : "off"
                    }
                  />
                )}
                <div id={`business-${name}-error`}>
                  {error && (
                    <FieldError>{t(name === "phone" ? "invalidPhone" : "invalid")}</FieldError>
                  )}
                </div>
              </Field>
            );
          })}
          {initialBusiness && (
            <DocumentUpload
              targetId={initialBusiness.id}
              purpose="business_logo"
              value={logo ? [logo] : []}
              onChange={(ids) => setLogo(ids[0] ?? null)}
              label={t("logo")}
              max={1}
            />
          )}
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending && <Spinner aria-hidden="true" />}
            {t(prepareRevision ? "prepareRevision" : initialBusiness ? "save" : "create")}
          </Button>
          {mutation.isError && (
            <Alert variant="destructive">
              <AlertDescription>
                {t(
                  mutation.error instanceof ApiError && mutation.error.status === 409
                    ? "exists"
                    : "uncertain",
                )}
              </AlertDescription>
            </Alert>
          )}
          {mutation.isError && (
            <Button variant="outline" onClick={onCheck}>
              {t("check")}
            </Button>
          )}
        </FieldGroup>
      </FieldSet>
    </form>
  );
}

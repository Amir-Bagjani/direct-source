"use client";
import { useId } from "react";
import { Input } from "@/shared/ui/input/input";
import { NativeSelect, NativeSelectOption } from "@/shared/ui/native-select/native-select";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/shared/ui/field/field";
import type { Taxonomy } from "../../schemas/catalog-management.schema";

type Props = {
  category: string;
  scope: "product" | "variant";
  taxonomy: Taxonomy;
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  disabled?: boolean;
};

export function AttributeFields({ category, scope, taxonomy, value, onChange, disabled }: Props) {
  const prefix = useId();
  const attributes = taxonomy.attributes
    .filter(
      (attribute) =>
        attribute.category === category && attribute.scope === scope && attribute.is_active,
    )
    .sort((left, right) => left.position - right.position);
  if (!attributes.length) return null;
  return (
    <FieldGroup className="grid gap-4 sm:grid-cols-2">
      {attributes.map((attribute) => {
        const current = value[attribute.code];
        const update = (next: unknown) => {
          if (!attribute.required && next === "") {
            const { [attribute.code]: _removed, ...remaining } = value;
            onChange(remaining);
          } else onChange({ ...value, [attribute.code]: next });
        };
        return (
          <Field key={attribute.id}>
            <FieldLabel htmlFor={`${prefix}-${attribute.id}`}>
              {attribute.name}
              {attribute.required ? " *" : ""}
            </FieldLabel>
            {attribute.kind === "choice" ? (
              <NativeSelect
                id={`${prefix}-${attribute.id}`}
                className="w-full"
                value={typeof current === "string" ? current : ""}
                required={attribute.required}
                disabled={disabled}
                onChange={(event) => update(event.target.value)}
              >
                <NativeSelectOption value="">—</NativeSelectOption>
                {attribute.options
                  .filter((option) => option.is_active)
                  .map((option) => (
                    <NativeSelectOption key={option.id} value={option.code}>
                      {option.label}
                    </NativeSelectOption>
                  ))}
              </NativeSelect>
            ) : (
              <Input
                id={`${prefix}-${attribute.id}`}
                type={attribute.kind === "number" ? "number" : "text"}
                step={attribute.kind === "number" ? "any" : undefined}
                maxLength={attribute.kind === "text" ? 120 : undefined}
                value={typeof current === "string" || typeof current === "number" ? current : ""}
                required={attribute.required}
                disabled={disabled}
                onChange={(event) =>
                  update(
                    attribute.kind === "number" && event.target.value
                      ? Number(event.target.value)
                      : event.target.value,
                  )
                }
              />
            )}
            {(attribute.description || attribute.unit) && (
              <FieldDescription>
                {[attribute.description, attribute.unit].filter(Boolean).join(" · ")}
              </FieldDescription>
            )}
          </Field>
        );
      })}
    </FieldGroup>
  );
}

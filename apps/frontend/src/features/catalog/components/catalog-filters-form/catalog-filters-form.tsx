"use client";
import { useTranslations } from "next-intl";
import type { CatalogFiltersFormProps } from "./catalog-filters-form.types";
import { Checkbox } from "@/shared/ui/checkbox/checkbox";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/shared/ui/field/field";
import { Input } from "@/shared/ui/input/input";
import { NativeSelect, NativeSelectOption } from "@/shared/ui/native-select/native-select";
import { Separator } from "@/shared/ui/separator/separator";

export function CatalogFiltersForm({
  filters,
  discovery,
  priceAllowed,
  id,
  onSubmit,
  footer,
}: CatalogFiltersFormProps) {
  const t = useTranslations("catalog");
  return (
    <form
      id={id}
      key={`${id}-${JSON.stringify(filters)}`}
      method="get"
      onSubmit={onSubmit}
      className="grid gap-5"
    >
      {(
        [
          ["category", t("categories"), discovery.categories, filters.categories],
          ["manufacturer", t("manufacturer.title"), discovery.manufacturers, filters.manufacturers],
        ] as const
      ).map(([name, label, options, selected]) => (
        <FieldSet key={name}>
          <FieldLegend variant="label">{label}</FieldLegend>
          <FieldGroup className="max-h-64 gap-0 overflow-y-auto">
            {options.map((option) => (
              <Field key={option.id} orientation="horizontal">
                <FieldLabel className="min-h-11 w-full" htmlFor={`${id}-${name}-${option.id}`}>
                  <Checkbox
                    id={`${id}-${name}-${option.id}`}
                    name={name}
                    value={option.id}
                    defaultChecked={selected.includes(option.id)}
                  />
                  <bdi>
                    {"path" in option
                      ? option.path
                          .map((category) => category.name)
                          .join(t("filters.categoryPathSeparator"))
                      : option.name}
                  </bdi>
                </FieldLabel>
              </Field>
            ))}
          </FieldGroup>
          {selected
            .filter((value) => !options.some((option) => option.id === value))
            .map((value) => (
              <input key={value} type="hidden" name={name} value={value} />
            ))}
        </FieldSet>
      ))}
      {discovery.attributes.map((attribute) => (
        <FieldSet key={attribute.id}>
          <FieldLegend variant="label">
            <bdi>{attribute.name}</bdi>
          </FieldLegend>
          <FieldDescription>
            <bdi>
              {discovery.categories.find((category) => category.id === attribute.category)?.name}
            </bdi>
            {attribute.unit ? ` · ${attribute.unit}` : ""}
          </FieldDescription>
          {attribute.kind === "choice" ? (
            <FieldGroup className="max-h-64 gap-0 overflow-y-auto">
              {attribute.options
                .filter((option) => option.is_active)
                .map((option) => (
                  <Field key={option.id} orientation="horizontal">
                    <FieldLabel className="min-h-11 w-full" htmlFor={`${id}-attr-${option.id}`}>
                      <Checkbox
                        id={`${id}-attr-${option.id}`}
                        name={`attr.${attribute.id}`}
                        value={option.code}
                        defaultChecked={
                          filters.attributes[attribute.id]?.includes(option.code) ?? false
                        }
                      />
                      <bdi>{option.label}</bdi>
                    </FieldLabel>
                  </Field>
                ))}
            </FieldGroup>
          ) : (
            <Field>
              <FieldLabel htmlFor={`${id}-attr-${attribute.id}`}>
                {t("filters.attributeValues")}
              </FieldLabel>
              <Input
                id={`${id}-attr-${attribute.id}`}
                name={`attr.${attribute.id}`}
                defaultValue={filters.attributes[attribute.id]?.join(",") ?? ""}
                aria-describedby={`${id}-attr-${attribute.id}-hint`}
              />
              <FieldDescription id={`${id}-attr-${attribute.id}-hint`}>
                {t("filters.attributeValuesHint")}
              </FieldDescription>
            </Field>
          )}
          {attribute.kind === "choice" &&
            filters.attributes[attribute.id]
              ?.filter(
                (value) =>
                  !attribute.options.some((option) => option.is_active && option.code === value),
              )
              .map((value) => (
                <input key={value} type="hidden" name={`attr.${attribute.id}`} value={value} />
              ))}
        </FieldSet>
      ))}
      {Object.entries(filters.attributes)
        .filter(([attribute]) => !discovery.attributes.some((item) => item.id === attribute))
        .flatMap(([attribute, values]) =>
          values.map((value) => (
            <input
              key={`${attribute}-${value}`}
              type="hidden"
              name={`attr.${attribute}`}
              value={value}
            />
          )),
        )}
      <Field>
        <FieldLabel htmlFor={`${id}-rating`}>{t("filters.ratingMin")}</FieldLabel>
        <Input
          id={`${id}-rating`}
          name="rating_min"
          type="number"
          min={0}
          max={5}
          step={0.01}
          defaultValue={filters.ratingMin}
        />
      </Field>
      <FieldSet>
        <FieldLegend variant="label">{t("filters.supply")}</FieldLegend>
        <FieldGroup className="gap-0">
          {(["ready", "production", "hybrid"] as const).map((value) => (
            <Field key={value} orientation="horizontal">
              <FieldLabel className="min-h-11 w-full" htmlFor={`${id}-supply-${value}`}>
                <Checkbox
                  id={`${id}-supply-${value}`}
                  name="supply"
                  value={value}
                  defaultChecked={filters.supply.includes(value)}
                />
                {t(`supply.${value}`)}
              </FieldLabel>
            </Field>
          ))}
        </FieldGroup>
      </FieldSet>
      <Separator />
      <FieldSet>
        <FieldLegend variant="label">{t("filters.method")}</FieldLegend>
        <FieldGroup className="gap-0">
          {(["free_mix", "fixed_pack"] as const).map((value) => (
            <Field key={value} orientation="horizontal">
              <FieldLabel className="min-h-11 w-full" htmlFor={`${id}-method-${value}`}>
                <Checkbox
                  id={`${id}-method-${value}`}
                  name="method"
                  value={value}
                  defaultChecked={filters.method.includes(value)}
                />
                {t(`method.${value}`)}
              </FieldLabel>
            </Field>
          ))}
        </FieldGroup>
      </FieldSet>
      <Separator />
      <Field>
        <FieldLabel htmlFor={`${id}-orderable`}>{t("filters.availability")}</FieldLabel>
        <NativeSelect
          id={`${id}-orderable`}
          name="orderable"
          defaultValue={filters.orderable}
          className="w-full [&_select]:min-h-11"
        >
          <NativeSelectOption value="">{t("filters.all")}</NativeSelectOption>
          <NativeSelectOption value="true">{t("orderable")}</NativeSelectOption>
          <NativeSelectOption value="false">{t("notOrderable")}</NativeSelectOption>
        </NativeSelect>
      </Field>
      <FieldSet>
        <FieldLegend variant="label">{t("card.preparation")}</FieldLegend>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor={`${id}-lead-min`}>{t("filters.leadMin")}</FieldLabel>
            <Input
              id={`${id}-lead-min`}
              name="lead_min"
              type="number"
              min={0}
              max={3650}
              defaultValue={filters.leadMin}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-lead-max`}>{t("filters.leadMax")}</FieldLabel>
            <Input
              id={`${id}-lead-max`}
              name="lead_max"
              type="number"
              min={0}
              max={3650}
              defaultValue={filters.leadMax}
            />
          </Field>
        </div>
      </FieldSet>
      {priceAllowed ? (
        <>
          <Separator />
          <FieldSet>
            <FieldLegend variant="label">{t("filters.priceRange")}</FieldLegend>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor={`${id}-price-min`}>{t("filters.priceMin")}</FieldLabel>
                <Input
                  id={`${id}-price-min`}
                  name="price_min"
                  type="number"
                  min={0}
                  max={100_000_000_000_000}
                  defaultValue={filters.priceMin}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${id}-price-max`}>{t("filters.priceMax")}</FieldLabel>
                <Input
                  id={`${id}-price-max`}
                  name="price_max"
                  type="number"
                  min={0}
                  max={100_000_000_000_000}
                  defaultValue={filters.priceMax}
                />
              </Field>
            </div>
          </FieldSet>
        </>
      ) : null}
      <input type="hidden" name="q" value={filters.q} />
      <input
        type="hidden"
        name="sort"
        value={priceAllowed || !filters.sort.startsWith("price_") ? filters.sort : ""}
      />
      {footer}
    </form>
  );
}

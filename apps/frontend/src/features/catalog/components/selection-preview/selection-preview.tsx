"use client";
import { useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { ApiError } from "@/shared/api/unwrap";
import { Alert, AlertDescription } from "@/shared/ui/alert/alert";
import { Button } from "@/shared/ui/button/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card/card";
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
import { Spinner } from "@/shared/ui/spinner/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/shared/ui/toggle-group/toggle-group";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table/table";
import { quoteInputSchema, type QuoteInput } from "../../schemas/catalog-quote.schema";
import { quoteMutationOptions } from "../../queries/catalog-quote.queries";
import { catalogKeys } from "../../queries/catalog.keys";
import { formatToman } from "../../utils/money";
import type { SelectionPreviewProps } from "./selection-preview.types";

export function SelectionPreview({
  scope,
  productId,
  plan,
  variants,
  quote,
}: SelectionPreviewProps) {
  const t = useTranslations("catalog.selection");
  const catalog = useTranslations("catalog");
  const format = useFormatter();
  const locale = useLocale();
  const id = useId();
  const client = useQueryClient();
  const [method, setMethod] = useState<QuoteInput["method"]>(
    plan.free_mix_min ? "free_mix" : "fixed_pack",
  );
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [packCode, setPackCode] = useState(plan.packs[0]?.code ?? "");
  const [packCount, setPackCount] = useState("1");
  const sourceVersion = JSON.stringify([
    plan,
    variants.map(({ id, sku, orderable, supply }) => ({ id, sku, orderable, supply })),
  ]);
  const selection =
    method === "free_mix"
      ? {
          method,
          items: variants
            .filter((variant) => variant.orderable && Number(quantities[variant.id]) > 0)
            .map((variant) => ({ variant: variant.id, quantity: Number(quantities[variant.id]) })),
        }
      : { method, pack_code: packCode, pack_count: Number(packCount) };
  const estimate = useMutation({
    ...quoteMutationOptions(scope, productId, () =>
      quote(productId, quoteInputSchema.parse(selection)),
    ),
    onMutate: () => sourceVersion,
    onError: (error) => {
      if (error instanceof ApiError && [401, 403].includes(error.status))
        void client.invalidateQueries({ queryKey: catalogKeys.wholesaleAccess() });
    },
  });
  const pack = plan.packs.find((item) => item.code === packCode);
  const allowed =
    method === "free_mix"
      ? Boolean(
          plan.free_mix_min &&
          "items" in selection &&
          selection.items.reduce((sum, item) => sum + item.quantity, 0) >= plan.free_mix_min,
        )
      : Boolean(
          pack &&
          pack.items.every((item) =>
            variants.some((variant) => variant.id === item.variant && variant.orderable),
          ),
        );
  const errorMessage =
    estimate.error instanceof ApiError
      ? [401, 403].includes(estimate.error.status)
        ? "accessError"
        : estimate.error.status === 409
          ? "supplyError"
          : estimate.error.status === 400
            ? "invalidError"
            : "error"
      : "error";

  return (
    <Card role="region" aria-label={t("title")}>
      <CardHeader>
        <CardTitle>
          <h3>{t("title")}</h3>
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            estimate.mutate();
          }}
          aria-busy={estimate.isPending}
        >
          <FieldSet disabled={estimate.isPending}>
            <FieldLegend>{t("method")}</FieldLegend>
            <FieldGroup>
              <ToggleGroup
                aria-label={t("method")}
                variant="outline"
                value={[method]}
                onValueChange={(values) => {
                  const next = values[0];
                  if (next === "free_mix" || next === "fixed_pack") {
                    setMethod(next);
                    estimate.reset();
                  }
                }}
              >
                {plan.free_mix_min && (
                  <ToggleGroupItem value="free_mix">{catalog("method.free_mix")}</ToggleGroupItem>
                )}
                {plan.packs.length > 0 && (
                  <ToggleGroupItem value="fixed_pack">
                    {catalog("method.fixed_pack")}
                  </ToggleGroupItem>
                )}
              </ToggleGroup>
              {method === "free_mix" ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    {t("minimum", { count: format.number(plan.free_mix_min ?? 1) })}
                  </p>
                  {variants.map((variant) => (
                    <Field key={variant.id}>
                      <FieldLabel htmlFor={`${id}-${variant.id}`}>
                        <bdi>{t("variantQuantity", { sku: variant.sku })}</bdi>
                      </FieldLabel>
                      <Input
                        id={`${id}-${variant.id}`}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        max={1_000_000_000}
                        value={quantities[variant.id] ?? ""}
                        disabled={!variant.orderable || estimate.isPending}
                        onChange={(event) => {
                          setQuantities((current) => ({
                            ...current,
                            [variant.id]: event.target.value,
                          }));
                          estimate.reset();
                        }}
                      />
                      {!variant.orderable && (
                        <FieldDescription>{catalog("notOrderable")}</FieldDescription>
                      )}
                    </Field>
                  ))}
                </>
              ) : (
                <>
                  <Field>
                    <FieldLabel htmlFor={`${id}-pack`}>{t("pack")}</FieldLabel>
                    <NativeSelect
                      id={`${id}-pack`}
                      value={packCode}
                      className="w-full"
                      onChange={(event) => {
                        setPackCode(event.target.value);
                        estimate.reset();
                      }}
                    >
                      {plan.packs.map((item) => (
                        <NativeSelectOption key={item.code} value={item.code}>
                          {item.name}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                    {pack && (
                      <FieldDescription>
                        {pack.items
                          .map(
                            (item) =>
                              `${variants.find((variant) => variant.id === item.variant)?.sku ?? item.variant} × ${format.number(item.quantity)}`,
                          )
                          .join(catalog("locationSeparator"))}
                      </FieldDescription>
                    )}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${id}-count`}>{t("packCount")}</FieldLabel>
                    <Input
                      id={`${id}-count`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      max={1_000_000_000}
                      required
                      value={packCount}
                      onChange={(event) => {
                        setPackCount(event.target.value);
                        estimate.reset();
                      }}
                    />
                  </Field>
                </>
              )}
              <Button type="submit" disabled={!allowed || estimate.isPending}>
                {estimate.isPending && <Spinner />}
                {t("calculate")}
              </Button>
            </FieldGroup>
          </FieldSet>
        </form>
        {estimate.isError && (
          <Alert variant="destructive">
            <AlertDescription>{t(errorMessage)}</AlertDescription>
          </Alert>
        )}
        {estimate.isSuccess && estimate.context !== sourceVersion && (
          <p role="status">{t("changed")}</p>
        )}
        {estimate.isSuccess && estimate.context === sourceVersion && (
          <section className="grid gap-4" aria-label={t("result")}>
            <p role="status" className="font-medium">
              {t("result")}
            </p>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">{t("quantity")}</dt>
                <dd>{format.number(estimate.data.quantity)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("tier")}</dt>
                <dd>{format.number(estimate.data.tier_min_quantity)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("total")}</dt>
                <dd>
                  {catalog("tomanAmount", {
                    amount: formatToman(estimate.data.goods_total_irr, locale),
                  })}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("preparation")}</dt>
                <dd>
                  {estimate.data.lead_time_days === 0
                    ? catalog("readyNow")
                    : t("productionDays", { count: format.number(estimate.data.lead_time_days) })}
                </dd>
              </div>
            </dl>
            <p className="text-sm text-muted-foreground">{catalog("wholesale.scrollHint")}</p>
            <Table>
              <TableCaption>{t("lines")}</TableCaption>
              <TableHeader>
                <TableRow>
                  {["sku", "quantity", "ready", "production", "unitPrice", "total"].map((key) => (
                    <TableHead key={key}>{t(key)}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {estimate.data.lines.map((line) => (
                  <TableRow key={line.variant}>
                    <TableCell>
                      <bdi>{line.sku}</bdi>
                    </TableCell>
                    <TableCell>{format.number(line.quantity)}</TableCell>
                    <TableCell>{format.number(line.from_ready)}</TableCell>
                    <TableCell>{format.number(line.from_production)}</TableCell>
                    <TableCell>
                      {catalog("tomanAmount", { amount: formatToman(line.unit_price_irr, locale) })}
                    </TableCell>
                    <TableCell>
                      {catalog("tomanAmount", { amount: formatToman(line.total_irr, locale) })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        )}
      </CardContent>
    </Card>
  );
}

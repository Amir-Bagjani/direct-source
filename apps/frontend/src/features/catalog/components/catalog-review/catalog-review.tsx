"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Alert, AlertDescription } from "@/shared/ui/alert/alert";
import { Button } from "@/shared/ui/button/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card/card";
import { Field, FieldLabel } from "@/shared/ui/field/field";
import { NativeSelect, NativeSelectOption } from "@/shared/ui/native-select/native-select";
import { Spinner } from "@/shared/ui/spinner/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table/table";
import { Textarea } from "@/shared/ui/textarea/textarea";
import { reviewProduct, reviewRevision } from "../../api/catalog-management.api";
import {
  reviewDetailOptions,
  revisionOptions,
  studioAccessOptions,
} from "../../queries/catalog-management.queries";
import { catalogKeys } from "../../queries/catalog.keys";

export function CatalogProductReview({ id }: { id: string }) {
  const t = useTranslations("catalogManagement");
  const access = useQuery(studioAccessOptions());
  const detail = useQuery({
    ...reviewDetailOptions(access.data?.scope ?? "pending", id),
    enabled: access.data?.operator === true,
  });
  if (access.isPending || (access.data?.operator && detail.isPending)) return <Loading />;
  if (access.isError || !access.data?.operator || detail.isError) return <Failure />;
  if (!detail.data) return null;
  return (
    <div className="flex flex-col gap-6">
      <ReviewHeader title={detail.data.product.name} />
      <Card>
        <CardHeader>
          <CardTitle>{t("baseProduct")}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-2 sm:grid-cols-2">
            <dt>{t("brand")}</dt>
            <dd>
              <bdi>{detail.data.product.brand}</bdi>
            </dd>
            <dt>{t("model")}</dt>
            <dd>
              <bdi>{detail.data.product.manufacturer_model}</bdi>
            </dd>
            <dt>{t("description")}</dt>
            <dd>
              <bdi>{detail.data.product.description}</bdi>
            </dd>
            <dt>{t("images")}</dt>
            <dd>{detail.data.product.images.length}</dd>
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("variants")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("sku")}</TableHead>
                <TableHead>{t("supplyMode")}</TableHead>
                <TableHead>{t("readyStock")}</TableHead>
                <TableHead>{t("productionCapacity")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.data.variants.map((variant) => {
                const supply = detail.data.supplies.find((item) => item.variant === variant.id);
                return (
                  <TableRow key={variant.id}>
                    <TableCell>
                      <bdi>{variant.sku}</bdi>
                    </TableCell>
                    <TableCell>{supply ? t(`supplyModes.${supply.mode}`) : "—"}</TableCell>
                    <TableCell>{supply?.ready_stock ?? "—"}</TableCell>
                    <TableCell>{supply?.production_cap ?? "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("salesAndPricing")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p>{t("tiersCount", { count: detail.data.sales_plan?.tiers.length ?? 0 })}</p>
          <p>{t("packsCount", { count: detail.data.sales_plan?.packs.length ?? 0 })}</p>
          <p>{t("servicesCount", { count: detail.data.shipping?.services.length ?? 0 })}</p>
        </CardContent>
      </Card>
      <DecisionForm scope={access.data.scope} id={id} kind="product" />
    </div>
  );
}

export function CatalogRevisionReview({ id }: { id: string }) {
  const t = useTranslations("catalogManagement");
  const access = useQuery(studioAccessOptions());
  const revision = useQuery({
    ...revisionOptions(access.data?.scope ?? "pending", id),
    enabled: access.data?.operator === true,
  });
  if (access.isPending || (access.data?.operator && revision.isPending)) return <Loading />;
  if (access.isError || !access.data?.operator || revision.isError) return <Failure />;
  if (!revision.data) return null;
  return (
    <div className="flex flex-col gap-6">
      <ReviewHeader title={t("contentRevision")} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Snapshot title={t("before")} value={revision.data.before} />
        <Snapshot title={t("proposed")} value={revision.data.proposed} />
      </div>
      <DecisionForm scope={access.data.scope} id={id} kind="revision" />
    </div>
  );
}

function ReviewHeader({ title }: { title: string }) {
  const t = useTranslations("catalogManagement");
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold">
        <bdi>{title}</bdi>
      </h1>
      <Button variant="outline" render={<Link href="/account/catalog/operations" />}>
        {t("backToQueue")}
      </Button>
    </div>
  );
}
function Loading() {
  const t = useTranslations("catalogManagement");
  return (
    <p role="status" className="flex items-center gap-2">
      <Spinner />
      {t("loading")}
    </p>
  );
}
function Failure() {
  const t = useTranslations("catalogManagement");
  return (
    <Alert variant="destructive">
      <AlertDescription>{t("loadError")}</AlertDescription>
    </Alert>
  );
}

function DecisionForm({
  scope,
  id,
  kind,
}: {
  scope: string;
  id: string;
  kind: "product" | "revision";
}) {
  const t = useTranslations("catalogManagement");
  const router = useRouter();
  const client = useQueryClient();
  const [decision, setDecision] = useState(kind === "product" ? "published" : "approved");
  const [code, setCode] = useState("");
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: async () => {
      if (kind === "product") await reviewProduct(id, decision, code, reason);
      else await reviewRevision(id, decision, code, reason);
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: catalogKeys.operator(scope) });
      router.replace("/account/catalog/operations");
    },
  });
  const choices =
    kind === "product"
      ? ["published", "changes_requested", "rejected"]
      : ["approved", "changes_requested", "rejected"];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("decision")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Field>
          <FieldLabel htmlFor="catalog-review-decision">{t("decision")}</FieldLabel>
          <NativeSelect
            id="catalog-review-decision"
            className="w-full"
            value={decision}
            onChange={(event) => setDecision(event.target.value)}
          >
            {choices.map((choice) => (
              <NativeSelectOption key={choice} value={choice}>
                {t(`decisions.${choice}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="catalog-review-code">{t("reasonCode")}</FieldLabel>
          <NativeSelect
            id="catalog-review-code"
            className="w-full"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          >
            <NativeSelectOption value="">—</NativeSelectOption>
            <NativeSelectOption value="content_incomplete">
              {t("reasonCodes.content_incomplete")}
            </NativeSelectOption>
            <NativeSelectOption value="invalid_pricing">
              {t("reasonCodes.invalid_pricing")}
            </NativeSelectOption>
            <NativeSelectOption value="policy_violation">
              {t("reasonCodes.policy_violation")}
            </NativeSelectOption>
            <NativeSelectOption value="approved">{t("reasonCodes.approved")}</NativeSelectOption>
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="catalog-review-reason">{t("reason")}</FieldLabel>
          <Textarea
            id="catalog-review-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        {mutation.isError && (
          <Alert variant="destructive">
            <AlertDescription>{t("commandError")}</AlertDescription>
          </Alert>
        )}
        <Button
          disabled={mutation.isPending || !code || !reason.trim()}
          onClick={() => mutation.mutate()}
        >
          {t("recordDecision")}
        </Button>
      </CardContent>
    </Card>
  );
}

function Snapshot({ title, value }: { title: string; value: Record<string, unknown> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3">
          {Object.entries(value).map(([key, item]) => (
            <div key={key} className="grid gap-1 border-b pb-2">
              <dt className="font-medium">
                <bdi>{key}</bdi>
              </dt>
              <dd className="text-sm text-muted-foreground">
                <SnapshotValue value={item} />
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
function SnapshotValue({ value }: { value: unknown }): React.ReactNode {
  if (value === null || value === undefined) return "—";
  if (["string", "number", "boolean"].includes(typeof value)) return <bdi>{String(value)}</bdi>;
  if (Array.isArray(value))
    return (
      <ul className="grid gap-1">
        {value.map((item, index) => (
          <li key={index}>
            <SnapshotValue value={item} />
          </li>
        ))}
      </ul>
    );
  if (typeof value === "object")
    return (
      <dl className="ms-3 grid gap-1">
        {Object.entries(value as Record<string, unknown>).map(([key, item]) => (
          <div key={key}>
            <dt className="inline font-medium">
              <bdi>{key}</bdi>:{" "}
            </dt>
            <dd className="inline">
              <SnapshotValue value={item} />
            </dd>
          </div>
        ))}
      </dl>
    );
  return String(value);
}

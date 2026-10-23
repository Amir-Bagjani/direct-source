"use client";
import { ApiError } from "@/shared/api/unwrap";
import { useRetainedQueryData } from "@/shared/hooks/use-retained-query-data";
import { PrivateQueryRegion } from "@/shared/ui/private-query-region/private-query-region";
import { useCatalogWorkspaceSession } from "@/features/accounts/contracts/catalog-workspace";
import { RevisionComparison } from "../revision-comparison/revision-comparison";
import { VariantPackageDetails } from "../variant-package-details/variant-package-details";
import { ProductPreview } from "../product-preview/product-preview";
import { PublicationChecklist } from "../publication-checklist/publication-checklist";
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
  const session = useCatalogWorkspaceSession();
  const access = useQuery({ ...studioAccessOptions(session.scope), enabled: session.authorized });
  const accessData = useRetainedQueryData(access, catalogKeys.studioAccess(session.scope));
  const detail = useQuery({
    ...reviewDetailOptions(session.scope, id),
    enabled: session.authorized && access.isSuccess && access.data?.operator === true,
  });
  const detailData = useRetainedQueryData(detail, catalogKeys.operatorReview(session.scope, id));
  if (
    [access.error, detail.error].some(
      (error) => error instanceof ApiError && [401, 403, 404].includes(error.status),
    )
  )
    return (
      <Failure
        denied={[access.error, detail.error].some(
          (error) => error instanceof ApiError && error.status === 403,
        )}
      />
    );
  if (access.isSuccess && !access.data.operator) return <Failure denied />;
  if ((!accessData || !detailData) && (access.isPending || (access.isSuccess && detail.isPending)))
    return <Loading />;
  if ((!accessData || !detailData) && (access.isError || detail.isError))
    return (
      <Failure
        retry={() => {
          if (access.isError) void access.refetch();
          else void detail.refetch();
        }}
      />
    );
  if (!accessData || !detailData) return null;
  return (
    <PrivateQueryRegion
      masked={
        !session.authorized ||
        access.isFetching ||
        !access.isSuccess ||
        detail.isFetching ||
        !detail.isSuccess
      }
      error={access.isError || detail.isError ? t("loadError") : undefined}
      retry={() => {
        if (access.isError) void access.refetch();
        else void detail.refetch();
      }}
    >
      <div className="flex flex-col gap-6">
        <ReviewHeader title={detailData.product.name} />
        <ProductPreview
          scope={accessData.scope}
          id={id}
          enabled={
            session.authorized &&
            access.isSuccess &&
            !access.isFetching &&
            detail.isSuccess &&
            !detail.isFetching
          }
        />
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t("revisionDiff.packaging")}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {detailData.shipping?.packages.map((item) => (
              <section key={item.variant} className="grid gap-3">
                <h3 className="font-semibold">
                  <bdi>
                    {detailData.variants.find((variant) => variant.id === item.variant)?.sku ??
                      item.variant}
                  </bdi>
                </h3>
                <VariantPackageDetails value={item} />
              </section>
            )) ?? <p>{t("revisionDiff.empty")}</p>}
          </CardContent>
        </Card>
        <PublicationChecklist readiness={detailData.readiness} />
        <DecisionForm scope={accessData.scope} id={id} kind="product" />
      </div>
    </PrivateQueryRegion>
  );
}

export function CatalogRevisionReview({ id }: { id: string }) {
  const t = useTranslations("catalogManagement");
  const session = useCatalogWorkspaceSession();
  const access = useQuery({ ...studioAccessOptions(session.scope), enabled: session.authorized });
  const accessData = useRetainedQueryData(access, catalogKeys.studioAccess(session.scope));
  const revision = useQuery({
    ...revisionOptions(session.scope, id),
    enabled: session.authorized && access.isSuccess && access.data?.operator === true,
  });
  const revisionData = useRetainedQueryData(
    revision,
    catalogKeys.operatorRevision(session.scope, id),
  );
  if (
    [access.error, revision.error].some(
      (error) => error instanceof ApiError && [401, 403, 404].includes(error.status),
    )
  )
    return (
      <Failure
        denied={[access.error, revision.error].some(
          (error) => error instanceof ApiError && error.status === 403,
        )}
      />
    );
  if (access.isSuccess && !access.data.operator) return <Failure denied />;
  if (
    (!accessData || !revisionData) &&
    (access.isPending || (access.isSuccess && revision.isPending))
  )
    return <Loading />;
  if ((!accessData || !revisionData) && (access.isError || revision.isError))
    return (
      <Failure
        retry={() => {
          if (access.isError) void access.refetch();
          else void revision.refetch();
        }}
      />
    );
  if (!accessData || !revisionData) return null;
  return (
    <PrivateQueryRegion
      masked={
        !session.authorized ||
        access.isFetching ||
        !access.isSuccess ||
        revision.isFetching ||
        !revision.isSuccess
      }
      error={access.isError || revision.isError ? t("loadError") : undefined}
      retry={() => {
        if (access.isError) void access.refetch();
        else void revision.refetch();
      }}
    >
      <div className="flex flex-col gap-6">
        <ReviewHeader title={t("contentRevision")} />
        <RevisionComparison revision={revisionData.revision} taxonomy={revisionData.taxonomy} />
        <DecisionForm scope={accessData.scope} id={id} kind="revision" />
      </div>
    </PrivateQueryRegion>
  );
}

function ReviewHeader({ title }: { title: string }) {
  const t = useTranslations("catalogManagement");
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold">
        <bdi>{title}</bdi>
      </h1>
      <Button
        nativeButton={false}
        variant="outline"
        render={<Link href="/account/catalog/operations" />}
      >
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
function Failure({ denied = false, retry }: { denied?: boolean; retry?: () => void }) {
  const t = useTranslations("catalogManagement");
  const common = useTranslations("common");
  return (
    <Alert variant="destructive">
      <AlertDescription>
        {t(denied ? "operatorRequired" : "loadError")}
        {retry && (
          <Button variant="outline" onClick={retry}>
            {common("retry")}
          </Button>
        )}
      </AlertDescription>
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

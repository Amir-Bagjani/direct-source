"use client";
import { useState, type SubmitEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Alert, AlertDescription } from "@/shared/ui/alert/alert";
import { Button } from "@/shared/ui/button/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card/card";
import { Checkbox } from "@/shared/ui/checkbox/checkbox";
import { Field, FieldLabel } from "@/shared/ui/field/field";
import { Input } from "@/shared/ui/input/input";
import { NativeSelect, NativeSelectOption } from "@/shared/ui/native-select/native-select";
import { Spinner } from "@/shared/ui/spinner/spinner";
import { Textarea } from "@/shared/ui/textarea/textarea";
import {
  claimProduct,
  revisionCommand,
  reviewProposal,
  saveTaxonomy,
} from "../../api/catalog-management.api";
import { operatorOptions, studioAccessOptions } from "../../queries/catalog-management.queries";
import { catalogKeys } from "../../queries/catalog.keys";
import type { Taxonomy } from "../../schemas/catalog-management.schema";

export function CatalogOperations() {
  const t = useTranslations("catalogManagement");
  const access = useQuery(studioAccessOptions());
  const dashboard = useQuery({
    ...operatorOptions(access.data?.scope ?? "pending"),
    enabled: access.data?.operator === true,
  });
  if (access.isPending || (access.data?.operator && dashboard.isPending))
    return (
      <p role="status" className="flex items-center gap-2">
        <Spinner />
        {t("loading")}
      </p>
    );
  if (access.isError || !access.data?.operator)
    return (
      <Alert variant="destructive">
        <AlertDescription>{t("operatorRequired")}</AlertDescription>
      </Alert>
    );
  if (dashboard.isError)
    return (
      <Alert variant="destructive">
        <AlertDescription>{t("loadError")}</AlertDescription>
      </Alert>
    );
  if (!dashboard.data) return null;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("operatorTitle")}</h1>
          <p className="text-muted-foreground">{t("operatorDescription")}</p>
        </div>
        <Button variant="outline" render={<Link href="/account/catalog" />}>
          {t("studioTitle")}
        </Button>
      </div>
      <ReviewQueues
        scope={access.data.scope}
        products={dashboard.data.products}
        revisions={dashboard.data.revisions}
      />
      <ProposalQueue scope={access.data.scope} proposals={dashboard.data.proposals} />
      <TaxonomyManager scope={access.data.scope} taxonomy={dashboard.data.taxonomy} />
    </div>
  );
}

function ReviewQueues({
  scope,
  products,
  revisions,
}: {
  scope: string;
  products: Array<{ id: string; name: string; submitted_at: string | null }>;
  revisions: Array<{ id: string; product: string; created_at: string }>;
}) {
  const t = useTranslations("catalogManagement");
  const router = useRouter();
  const client = useQueryClient();
  const claim = useMutation({
    mutationFn: (id: string) => claimProduct(id),
    onSuccess: (_, id) => {
      void client.invalidateQueries({ queryKey: catalogKeys.operator(scope) });
      router.push(`/account/catalog/operations/products/${id}`);
    },
  });
  const claimRevision = useMutation({
    mutationFn: (id: string) => revisionCommand("revision-claim", id),
    onSuccess: (_, id) => {
      void client.invalidateQueries({ queryKey: catalogKeys.operator(scope) });
      router.push(`/account/catalog/operations/revisions/${id}`);
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("reviewQueue")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5">
        <section className="grid gap-3">
          <h3 className="font-medium">{t("productReviews")}</h3>
          {products.length ? (
            products.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div>
                  <bdi>{item.name}</bdi>
                  <p className="text-sm text-muted-foreground">
                    {item.submitted_at ? new Date(item.submitted_at).toLocaleString() : "—"}
                  </p>
                </div>
                <Button onClick={() => claim.mutate(item.id)} disabled={claim.isPending}>
                  {t("claimAndReview")}
                </Button>
              </div>
            ))
          ) : (
            <p>{t("emptyQueue")}</p>
          )}
        </section>
        <section className="grid gap-3">
          <h3 className="font-medium">{t("revisionReviews")}</h3>
          {revisions.length ? (
            revisions.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div>
                  <span>{item.product}</span>
                  <p className="text-sm text-muted-foreground">
                    {new Date(item.created_at).toLocaleString()}
                  </p>
                </div>
                <Button
                  onClick={() => claimRevision.mutate(item.id)}
                  disabled={claimRevision.isPending}
                >
                  {t("claimAndReview")}
                </Button>
              </div>
            ))
          ) : (
            <p>{t("emptyQueue")}</p>
          )}
        </section>
        {(claim.isError || claimRevision.isError) && (
          <Alert variant="destructive">
            <AlertDescription>{t("commandError")}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function ProposalQueue({
  scope,
  proposals,
}: {
  scope: string;
  proposals: Array<{
    id: string;
    kind: "category" | "attribute" | "option";
    category: string | null;
    attribute: string | null;
    name: string;
    description: string;
    example: string;
  }>;
}) {
  const t = useTranslations("catalogManagement");
  const client = useQueryClient();
  const review = useMutation({
    mutationFn: ({
      proposal,
      decision,
      reason,
    }: {
      proposal: (typeof proposals)[number];
      decision: "approved" | "rejected";
      reason: string;
    }) =>
      reviewProposal(proposal.id, {
        decision,
        reason,
        ...(decision === "approved"
          ? {
              definition:
                proposal.kind === "category"
                  ? {
                      name: proposal.name,
                      slug: slug(proposal.name),
                      parent: proposal.category,
                      description: proposal.description,
                      position: 0,
                      is_active: true,
                    }
                  : proposal.kind === "attribute"
                    ? {
                        category: proposal.category,
                        code: slug(proposal.name),
                        name: proposal.name,
                        description: proposal.description,
                        kind: "text",
                        scope: "product",
                        unit: "",
                        required: false,
                        filterable: false,
                        position: 0,
                        is_active: true,
                      }
                    : {
                        attribute: proposal.attribute,
                        code: slug(proposal.name),
                        label: proposal.name,
                        position: 0,
                        is_active: true,
                      },
            }
          : {}),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: catalogKeys.operator(scope) }),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("proposalQueue")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {proposals.length ? (
          proposals.map((proposal) => (
            <ProposalReview
              key={proposal.id}
              proposal={proposal}
              pending={review.isPending}
              onReview={(decision, reason) => review.mutate({ proposal, decision, reason })}
            />
          ))
        ) : (
          <p>{t("emptyQueue")}</p>
        )}
        {review.isError && (
          <Alert variant="destructive">
            <AlertDescription>{t("saveError")}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function ProposalReview({
  proposal,
  pending,
  onReview,
}: {
  proposal: { kind: string; name: string; description: string; example: string };
  pending: boolean;
  onReview: (decision: "approved" | "rejected", reason: string) => void;
}) {
  const t = useTranslations("catalogManagement");
  const [reason, setReason] = useState("");
  return (
    <div className="grid gap-3 rounded-lg border p-3">
      <div>
        <p className="font-medium">
          {t(`proposalKinds.${proposal.kind}`)}: <bdi>{proposal.name}</bdi>
        </p>
        <p>
          <bdi>{proposal.description}</bdi>
        </p>
        <p className="text-sm text-muted-foreground">
          <bdi>{proposal.example}</bdi>
        </p>
      </div>
      <Textarea
        value={reason}
        placeholder={t("reason")}
        onChange={(event) => setReason(event.target.value)}
      />
      <div className="flex gap-2">
        <Button disabled={pending || !reason.trim()} onClick={() => onReview("approved", reason)}>
          {t("approve")}
        </Button>
        <Button
          variant="destructive"
          disabled={pending || !reason.trim()}
          onClick={() => onReview("rejected", reason)}
        >
          {t("reject")}
        </Button>
      </div>
    </div>
  );
}

function TaxonomyManager({ scope, taxonomy }: { scope: string; taxonomy: Taxonomy }) {
  const t = useTranslations("catalogManagement");
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: saveTaxonomy,
    onSuccess: () => client.invalidateQueries({ queryKey: catalogKeys.operator(scope) }),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("taxonomy")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6">
        <TaxonomyCreate
          taxonomy={taxonomy}
          pending={mutation.isPending}
          save={(body) => mutation.mutate(body)}
        />
        <div className="grid gap-3">
          <h3 className="font-medium">{t("categories")}</h3>
          {taxonomy.categories.map((item) => (
            <TaxonomyRow
              key={item.id}
              label={item.name}
              active={item.is_active}
              onToggle={(reason) =>
                mutation.mutate({ kind: "category", ...item, is_active: !item.is_active, reason })
              }
            />
          ))}
        </div>
        <div className="grid gap-3">
          <h3 className="font-medium">{t("attributes")}</h3>
          {taxonomy.attributes.map((item) => (
            <TaxonomyRow
              key={item.id}
              label={item.name}
              active={item.is_active}
              onToggle={(reason) =>
                mutation.mutate({
                  kind: "attribute",
                  id: item.id,
                  category: item.category,
                  code: item.code,
                  name: item.name,
                  description: item.description,
                  type: item.kind,
                  scope: item.scope,
                  unit: item.unit,
                  required: item.required,
                  filterable: item.filterable,
                  position: item.position,
                  is_active: !item.is_active,
                  reason,
                })
              }
            />
          ))}
        </div>
        {mutation.isError && (
          <Alert variant="destructive">
            <AlertDescription>{t("saveError")}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function TaxonomyCreate({
  taxonomy,
  pending,
  save,
}: {
  taxonomy: Taxonomy;
  pending: boolean;
  save: (body: unknown) => void;
}) {
  const t = useTranslations("catalogManagement");
  const [kind, setKind] = useState<"category" | "attribute" | "option">("category");
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const common = {
      name: String(data.get("name")),
      position: Number(data.get("position")),
      is_active: true,
    };
    save(
      kind === "category"
        ? {
            kind,
            ...common,
            slug: String(data.get("code")),
            parent: String(data.get("category") || "") || null,
            description: String(data.get("description")),
          }
        : kind === "attribute"
          ? {
              kind,
              ...common,
              category: String(data.get("category")),
              code: String(data.get("code")),
              description: String(data.get("description")),
              type: String(data.get("type")),
              scope: String(data.get("scope")),
              unit: String(data.get("unit")),
              required: data.get("required") === "on",
              filterable: data.get("filterable") === "on",
            }
          : {
              kind,
              attribute: String(data.get("attribute")),
              code: String(data.get("code")),
              label: common.name,
              position: common.position,
              is_active: true,
            },
    );
  }
  return (
    <form className="grid gap-4 rounded-lg border p-4" onSubmit={submit}>
      <Field>
        <FieldLabel>{t("type")}</FieldLabel>
        <NativeSelect
          className="w-full"
          value={kind}
          onChange={(event) => setKind(event.target.value as typeof kind)}
        >
          {["category", "attribute", "option"].map((value) => (
            <NativeSelectOption key={value} value={value}>
              {t(`proposalKinds.${value}`)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      {kind !== "option" && (
        <Field>
          <FieldLabel>{t("categoryParent")}</FieldLabel>
          <NativeSelect name="category" className="w-full" required={kind === "attribute"}>
            <NativeSelectOption value="">—</NativeSelectOption>
            {taxonomy.categories.map((item) => (
              <NativeSelectOption key={item.id} value={item.id}>
                {item.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      )}
      {kind === "option" && (
        <Field>
          <FieldLabel>{t("attribute")}</FieldLabel>
          <NativeSelect name="attribute" className="w-full" required>
            {taxonomy.attributes
              .filter((item) => item.kind === "choice")
              .map((item) => (
                <NativeSelectOption key={item.id} value={item.id}>
                  {item.name}
                </NativeSelectOption>
              ))}
          </NativeSelect>
        </Field>
      )}
      <Field>
        <FieldLabel>{t("name")}</FieldLabel>
        <Input name="name" required />
      </Field>
      <Field>
        <FieldLabel>{t("code")}</FieldLabel>
        <Input name="code" required pattern="[a-z0-9_-]+" dir="ltr" />
      </Field>
      {kind !== "option" && (
        <Field>
          <FieldLabel>{t("description")}</FieldLabel>
          <Textarea name="description" />
        </Field>
      )}
      {kind === "attribute" && (
        <>
          <Field>
            <FieldLabel>{t("attributeKind")}</FieldLabel>
            <NativeSelect name="type" className="w-full">
              <NativeSelectOption value="text">{t("attributeKinds.text")}</NativeSelectOption>
              <NativeSelectOption value="number">{t("attributeKinds.number")}</NativeSelectOption>
              <NativeSelectOption value="choice">{t("attributeKinds.choice")}</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel>{t("attributeScope")}</FieldLabel>
            <NativeSelect name="scope" className="w-full">
              <NativeSelectOption value="product">{t("scopes.product")}</NativeSelectOption>
              <NativeSelectOption value="variant">{t("scopes.variant")}</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel>{t("unit")}</FieldLabel>
            <Input name="unit" />
          </Field>
          <label className="flex items-center gap-2">
            <Checkbox name="required" />
            {t("required")}
          </label>
          <label className="flex items-center gap-2">
            <Checkbox name="filterable" />
            {t("filterable")}
          </label>
        </>
      )}
      <Field>
        <FieldLabel>{t("position")}</FieldLabel>
        <Input name="position" type="number" defaultValue={0} />
      </Field>
      <Button type="submit" disabled={pending}>
        {t("create")}
      </Button>
    </form>
  );
}

function TaxonomyRow({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: (reason: string) => void;
}) {
  const t = useTranslations("catalogManagement");
  const [reason, setReason] = useState("");
  return (
    <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_2fr_auto] sm:items-center">
      <span>
        <bdi>{label}</bdi> · {active ? t("active") : t("inactive")}
      </span>
      <Input
        value={reason}
        placeholder={t("statusReason")}
        onChange={(event) => setReason(event.target.value)}
      />
      <Button variant="outline" disabled={!reason.trim()} onClick={() => onToggle(reason)}>
        {active ? t("deactivate") : t("activate")}
      </Button>
    </div>
  );
}

function slug(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || `proposal-${Date.now()}`
  );
}

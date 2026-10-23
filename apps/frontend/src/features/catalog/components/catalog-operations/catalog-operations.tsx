"use client";
import { ApiError } from "@/shared/api/unwrap";
import { useRetainedQueryData } from "@/shared/hooks/use-retained-query-data";
import { PrivateQueryRegion } from "@/shared/ui/private-query-region/private-query-region";
import { useCatalogWorkspaceSession } from "@/features/accounts/contracts/catalog-workspace";
import { useId, useState, type SubmitEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Alert, AlertDescription } from "@/shared/ui/alert/alert";
import { Button } from "@/shared/ui/button/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card/card";
import { Checkbox } from "@/shared/ui/checkbox/checkbox";
import { Field, FieldLabel, FieldSet } from "@/shared/ui/field/field";
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
import {
  taxonomyMutationSchema,
  type TaxonomyMutation,
  type Taxonomy,
} from "../../schemas/catalog-management.schema";

export function CatalogOperations() {
  const t = useTranslations("catalogManagement");
  const common = useTranslations("common");
  const session = useCatalogWorkspaceSession();
  const access = useQuery({ ...studioAccessOptions(session.scope), enabled: session.authorized });
  const accessData = useRetainedQueryData(access, catalogKeys.studioAccess(session.scope));
  const dashboard = useQuery({
    ...operatorOptions(session.scope),
    enabled: session.authorized && access.isSuccess && access.data?.operator === true,
  });
  const dashboardData = useRetainedQueryData(dashboard, catalogKeys.operator(session.scope));
  if (
    [access.error, dashboard.error].some(
      (error) => error instanceof ApiError && [401, 403, 404].includes(error.status),
    )
  )
    return (
      <Alert variant="destructive">
        <AlertDescription>{t("operatorRequired")}</AlertDescription>
      </Alert>
    );
  if (
    (!accessData || !dashboardData) &&
    (access.isPending || (access.isSuccess && access.data.operator && dashboard.isPending))
  )
    return (
      <p role="status" className="flex items-center gap-2">
        <Spinner />
        {t("loading")}
      </p>
    );
  if (access.isSuccess && !access.data.operator)
    return (
      <Alert variant="destructive">
        <AlertDescription>{t("operatorRequired")}</AlertDescription>
      </Alert>
    );
  if (!dashboardData && (dashboard.isError || access.isError))
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {t("loadError")}
          <Button
            variant="outline"
            onClick={() => {
              if (access.isError) void access.refetch();
              else void dashboard.refetch();
            }}
          >
            {common("retry")}
          </Button>
        </AlertDescription>
      </Alert>
    );
  if (!accessData || !dashboardData) return null;
  return (
    <PrivateQueryRegion
      masked={
        !session.authorized ||
        access.isFetching ||
        !access.isSuccess ||
        dashboard.isFetching ||
        !dashboard.isSuccess
      }
      error={access.isError || dashboard.isError ? t("loadError") : undefined}
      retry={() => {
        if (access.isError) void access.refetch();
        else void dashboard.refetch();
      }}
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{t("operatorTitle")}</h1>
            <p className="text-muted-foreground">{t("operatorDescription")}</p>
          </div>
          <Button nativeButton={false} variant="outline" render={<Link href="/account/catalog" />}>
            {t("studioTitle")}
          </Button>
        </div>
        <ReviewQueues
          scope={accessData.scope}
          products={dashboardData.products}
          revisions={dashboardData.revisions}
        />
        <ProposalQueue
          scope={accessData.scope}
          proposals={dashboardData.proposals}
          taxonomy={dashboardData.taxonomy}
        />
        <TaxonomyManager scope={accessData.scope} taxonomy={dashboardData.taxonomy} />
      </div>
    </PrivateQueryRegion>
  );
}

function ReviewQueues({
  scope,
  products,
  revisions,
}: {
  scope: string;
  products: Array<{ id: string; name: string; submitted_at: string | null }>;
  revisions: Array<{ id: string; product: string; product_name: string; created_at: string }>;
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
                role="group"
                aria-label={item.name}
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
                role="group"
                aria-label={item.product_name}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div>
                  <span dir="auto">{item.product_name}</span>
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
  taxonomy,
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
  taxonomy: Taxonomy;
}) {
  const t = useTranslations("catalogManagement");
  const client = useQueryClient();
  const review = useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      decision: "approved" | "rejected";
      reason: string;
      definition?: Record<string, unknown>;
    }) => reviewProposal(id, body),
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
              taxonomy={taxonomy}
              pending={review.isPending}
              onReview={(decision, reason, definition) =>
                review.mutate({
                  id: proposal.id,
                  decision,
                  reason,
                  ...(definition ? { definition } : {}),
                })
              }
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
  taxonomy,
  pending,
  onReview,
}: {
  proposal: {
    kind: "category" | "attribute" | "option";
    category: string | null;
    attribute: string | null;
    name: string;
    description: string;
    example: string;
  };
  taxonomy: Taxonomy;
  pending: boolean;
  onReview: (
    decision: "approved" | "rejected",
    reason: string,
    definition?: Record<string, unknown>,
  ) => void;
}) {
  const t = useTranslations("catalogManagement");
  const id = useId();
  const [reason, setReason] = useState("");
  const initial: TaxonomyMutation =
    proposal.kind === "category"
      ? {
          kind: "category",
          name: proposal.name,
          slug: "",
          parent: proposal.category,
          description: proposal.description,
          position: 0,
          is_active: true,
        }
      : proposal.kind === "attribute"
        ? {
            kind: "attribute",
            category: proposal.category ?? "",
            code: "",
            name: proposal.name,
            description: proposal.description,
            type: "text",
            scope: "product",
            unit: "",
            required: false,
            filterable: false,
            position: 0,
            is_active: true,
          }
        : {
            kind: "option",
            attribute: proposal.attribute ?? "",
            code: "",
            label: proposal.name,
            position: 0,
            is_active: true,
          };
  return (
    <section className="grid gap-4 rounded-lg border p-4" aria-labelledby={`${id}-title`}>
      <div>
        <h3 id={`${id}-title`} className="font-medium">
          {t(`proposalKinds.${proposal.kind}`)}: <bdi>{proposal.name}</bdi>
        </h3>
        <p>
          <bdi>{proposal.description}</bdi>
        </p>
        <p className="text-sm text-muted-foreground">
          <bdi>{proposal.example}</bdi>
        </p>
      </div>
      <Field>
        <FieldLabel htmlFor={`${id}-reason`}>{t("reason")}</FieldLabel>
        <Textarea
          id={`${id}-reason`}
          maxLength={2000}
          value={reason}
          disabled={pending}
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>
      <p className="text-sm text-muted-foreground">{t("proposalDefinitionHint")}</p>
      <TaxonomyCreate
        taxonomy={taxonomy}
        initial={initial}
        pending={pending}
        submitDisabled={!reason.trim()}
        submitLabel={t("approve")}
        save={(input) => {
          if (input.kind === "attribute") {
            const { kind: _kind, id: _id, reason: _reason, type, ...definition } = input;
            onReview("approved", reason, { ...definition, kind: type });
          } else {
            const { kind: _kind, id: _id, reason: _reason, ...definition } = input;
            onReview("approved", reason, definition);
          }
        }}
      />
      <Button
        variant="destructive"
        disabled={pending || !reason.trim()}
        onClick={() => onReview("rejected", reason)}
      >
        {t("reject")}
      </Button>
    </section>
  );
}

function TaxonomyManager({ scope, taxonomy }: { scope: string; taxonomy: Taxonomy }) {
  const t = useTranslations("catalogManagement");
  const client = useQueryClient();
  const [editing, setEditing] = useState<TaxonomyMutation>();
  const mutation = useMutation({
    mutationFn: saveTaxonomy,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: catalogKeys.operator(scope) });
      setEditing(undefined);
    },
  });
  const definitions: TaxonomyMutation[] = [
    ...taxonomy.categories.map((item) => ({ ...item, kind: "category" as const })),
    ...taxonomy.attributes.map(({ kind, options: _options, ...item }) => ({
      ...item,
      kind: "attribute" as const,
      type: kind,
    })),
    ...taxonomy.options.map((item) => ({ ...item, kind: "option" as const })),
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("taxonomy")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6">
        {editing ? (
          <section className="grid gap-3">
            <h3 className="font-medium">{t("editDefinition")}</h3>
            <p className="text-sm text-muted-foreground">{t("definitionHistoryHint")}</p>
            <TaxonomyCreate
              key={editing.id}
              taxonomy={taxonomy}
              initial={editing}
              pending={mutation.isPending}
              save={(body) => mutation.mutate(body)}
            />
            <Button
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => setEditing(undefined)}
            >
              {t("cancel")}
            </Button>
          </section>
        ) : (
          <TaxonomyCreate
            taxonomy={taxonomy}
            pending={mutation.isPending}
            save={(body) => mutation.mutate(body)}
          />
        )}
        {(["category", "attribute", "option"] as const).map((kind) => (
          <section key={kind} className="grid gap-3">
            <h3 className="font-medium">{t(`proposalKinds.${kind}`)}</h3>
            {definitions
              .filter((item) => item.kind === kind)
              .map((item) => (
                <TaxonomyRow
                  key={item.id}
                  label={item.kind === "option" ? item.label : item.name}
                  active={item.is_active}
                  pending={mutation.isPending}
                  onEdit={() => setEditing(item)}
                  onToggle={(reason) =>
                    mutation.mutate({ ...item, is_active: !item.is_active, reason })
                  }
                />
              ))}
          </section>
        ))}
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
  initial,
  submitLabel,
  submitDisabled = false,
}: {
  taxonomy: Taxonomy;
  pending: boolean;
  save: (body: TaxonomyMutation) => void;
  initial?: TaxonomyMutation;
  submitLabel?: string;
  submitDisabled?: boolean;
}) {
  const t = useTranslations("catalogManagement");
  const id = useId();
  const [kind, setKind] = useState<TaxonomyMutation["kind"]>(initial?.kind ?? "category");
  const [attributeKind, setAttributeKind] = useState(
    initial?.kind === "attribute" ? initial.type : "text",
  );
  const [invalid, setInvalid] = useState(false);
  const category = initial?.kind === "category" ? initial : undefined;
  const attribute = initial?.kind === "attribute" ? initial : undefined;
  const option = initial?.kind === "option" ? initial : undefined;
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || submitDisabled) return;
    const data = new FormData(event.currentTarget);
    const reason = String(data.get("reason") ?? "").trim();
    const common = {
      ...(initial?.id ? { id: initial.id } : {}),
      position: Number(data.get("position")),
      is_active: initial?.is_active ?? true,
      ...(reason ? { reason } : {}),
    };
    const name = String(data.get("name"));
    const result = taxonomyMutationSchema.safeParse(
      kind === "category"
        ? {
            ...common,
            kind,
            name,
            slug: String(data.get("code")),
            parent: String(data.get("category") || "") || null,
            description: String(data.get("description")),
          }
        : kind === "attribute"
          ? {
              ...common,
              kind,
              name,
              category: String(data.get("category")),
              code: String(data.get("code")),
              description: String(data.get("description")),
              type: attributeKind,
              scope: String(data.get("scope")),
              unit: attributeKind === "number" ? String(data.get("unit")) : "",
              required: data.get("required") === "on",
              filterable: data.get("filterable") === "on",
            }
          : {
              ...common,
              kind,
              attribute: String(data.get("attribute")),
              code: String(data.get("code")),
              label: name,
            },
    );
    setInvalid(!result.success);
    if (result.success) save(result.data);
  }
  return (
    <form key={kind} className="grid gap-4 rounded-lg border p-4" onSubmit={submit}>
      {!initial && (
        <Field>
          <FieldLabel htmlFor={`${id}-kind`}>{t("type")}</FieldLabel>
          <NativeSelect
            id={`${id}-kind`}
            className="w-full"
            value={kind}
            onChange={(event) => {
              const value = event.target.value;
              if (value === "category" || value === "attribute" || value === "option") {
                setKind(value);
                setInvalid(false);
              }
            }}
          >
            {(["category", "attribute", "option"] as const).map((value) => (
              <NativeSelectOption key={value} value={value}>
                {t(`proposalKinds.${value}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      )}
      <FieldSet disabled={pending}>
        {kind !== "option" && (
          <Field>
            <FieldLabel htmlFor={`${id}-category`}>{t("categoryParent")}</FieldLabel>
            <NativeSelect
              id={`${id}-category`}
              name="category"
              className="w-full"
              required={kind === "attribute"}
              defaultValue={category?.parent ?? attribute?.category ?? ""}
            >
              <NativeSelectOption value="">—</NativeSelectOption>
              {taxonomy.categories
                .filter((item) => item.id !== initial?.id)
                .map((item) => (
                  <NativeSelectOption key={item.id} value={item.id}>
                    {item.name}
                  </NativeSelectOption>
                ))}
            </NativeSelect>
          </Field>
        )}
        {kind === "option" && (
          <Field>
            <FieldLabel htmlFor={`${id}-attribute`}>{t("attribute")}</FieldLabel>
            <NativeSelect
              id={`${id}-attribute`}
              name="attribute"
              className="w-full"
              required
              defaultValue={option?.attribute ?? ""}
            >
              <NativeSelectOption value="">—</NativeSelectOption>
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
          <FieldLabel htmlFor={`${id}-name`}>{t("name")}</FieldLabel>
          <Input
            id={`${id}-name`}
            name="name"
            required
            maxLength={120}
            defaultValue={category?.name ?? attribute?.name ?? option?.label ?? ""}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-code`}>{t("code")}</FieldLabel>
          <Input
            id={`${id}-code`}
            name="code"
            required
            maxLength={50}
            pattern="[a-zA-Z0-9_-]+"
            dir="ltr"
            defaultValue={category?.slug ?? attribute?.code ?? option?.code ?? ""}
          />
        </Field>
        {kind !== "option" && (
          <Field>
            <FieldLabel htmlFor={`${id}-description`}>{t("description")}</FieldLabel>
            <Textarea
              id={`${id}-description`}
              name="description"
              maxLength={1000}
              defaultValue={category?.description ?? attribute?.description ?? ""}
            />
          </Field>
        )}
        {kind === "attribute" && (
          <>
            <Field>
              <FieldLabel htmlFor={`${id}-type`}>{t("attributeKind")}</FieldLabel>
              <NativeSelect
                id={`${id}-type`}
                name="type"
                className="w-full"
                value={attributeKind}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "text" || value === "number" || value === "choice")
                    setAttributeKind(value);
                }}
              >
                {(["text", "number", "choice"] as const).map((value) => (
                  <NativeSelectOption key={value} value={value}>
                    {t(`attributeKinds.${value}`)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-scope`}>{t("attributeScope")}</FieldLabel>
              <NativeSelect
                id={`${id}-scope`}
                name="scope"
                className="w-full"
                defaultValue={attribute?.scope ?? "product"}
              >
                <NativeSelectOption value="product">{t("scopes.product")}</NativeSelectOption>
                <NativeSelectOption value="variant">{t("scopes.variant")}</NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-unit`}>{t("unit")}</FieldLabel>
              <Input
                id={`${id}-unit`}
                name="unit"
                maxLength={40}
                required={attributeKind === "number"}
                disabled={attributeKind !== "number"}
                defaultValue={attribute?.unit ?? ""}
              />
            </Field>
            <FieldLabel>
              <Checkbox name="required" defaultChecked={attribute?.required ?? false} />
              {t("required")}
            </FieldLabel>
            <FieldLabel>
              <Checkbox name="filterable" defaultChecked={attribute?.filterable ?? false} />
              {t("filterable")}
            </FieldLabel>
          </>
        )}
        <Field>
          <FieldLabel htmlFor={`${id}-position`}>{t("position")}</FieldLabel>
          <Input
            id={`${id}-position`}
            name="position"
            type="number"
            min={0}
            max={2147483647}
            defaultValue={initial?.position ?? 0}
            required
          />
        </Field>
        {initial?.id && (
          <Field>
            <FieldLabel htmlFor={`${id}-reason`}>{t("reason")}</FieldLabel>
            <Textarea id={`${id}-reason`} name="reason" maxLength={2000} />
          </Field>
        )}
      </FieldSet>
      {invalid && (
        <Alert variant="destructive">
          <AlertDescription>{t("saveError")}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={pending || submitDisabled}>
        {submitLabel ?? (initial?.id ? t("saveDefinition") : t("create"))}
      </Button>
    </form>
  );
}

function TaxonomyRow({
  label,
  active,
  pending,
  onToggle,
  onEdit,
}: {
  label: string;
  active: boolean;
  pending: boolean;
  onToggle: (reason: string) => void;
  onEdit: () => void;
}) {
  const t = useTranslations("catalogManagement");
  const [reason, setReason] = useState("");
  const id = useId();
  return (
    <div
      role="group"
      aria-label={label}
      className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end"
    >
      <p>
        <bdi>{label}</bdi> · {active ? t("active") : t("inactive")}
      </p>
      <Field>
        <FieldLabel htmlFor={id}>{t("statusReason")}</FieldLabel>
        <Input
          id={id}
          value={reason}
          maxLength={2000}
          disabled={pending}
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={pending} onClick={onEdit}>
          {t("editDefinition")}
        </Button>
        <Button
          variant="outline"
          disabled={pending || !reason.trim()}
          onClick={() => onToggle(reason)}
        >
          {active ? t("deactivate") : t("activate")}
        </Button>
      </div>
    </div>
  );
}

"use client";
import { ApiError } from "@/shared/api/unwrap";
import { useRetainedQueryData } from "@/shared/hooks/use-retained-query-data";
import { PrivateQueryRegion } from "@/shared/ui/private-query-region/private-query-region";
import { useCatalogWorkspaceSession } from "@/features/accounts/contracts/catalog-workspace";
import { useState, type SubmitEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Badge } from "@/shared/ui/badge/badge";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert/alert";
import { buttonVariants } from "@/shared/ui/button/button.variants";
import { Button } from "@/shared/ui/button/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card/card";
import { Field, FieldGroup, FieldLabel } from "@/shared/ui/field/field";
import { Input } from "@/shared/ui/input/input";
import { NativeSelect, NativeSelectOption } from "@/shared/ui/native-select/native-select";
import { Spinner } from "@/shared/ui/spinner/spinner";
import { Textarea } from "@/shared/ui/textarea/textarea";
import { catalogKeys } from "../../queries/catalog.keys";
import { studioAccessOptions, studioOptions } from "../../queries/catalog-management.queries";
import { saveProduct, saveProposal, uploadProductImage } from "../../api/catalog-management.api";
import { AttributeFields } from "../attribute-fields/attribute-fields";
import type { StudioAccess, Taxonomy } from "../../schemas/catalog-management.schema";

export function CatalogStudio() {
  const t = useTranslations("catalogManagement");
  const common = useTranslations("common");
  const session = useCatalogWorkspaceSession();
  const access = useQuery({ ...studioAccessOptions(session.scope), enabled: session.authorized });
  const accessData = useRetainedQueryData(access, catalogKeys.studioAccess(session.scope));
  const studio = useQuery({
    ...studioOptions(session.scope),
    enabled: session.authorized && access.isSuccess,
  });
  const studioData = useRetainedQueryData(studio, catalogKeys.studio(session.scope));
  if (
    [access.error, studio.error].some(
      (error) => error instanceof ApiError && [401, 403, 404].includes(error.status),
    )
  )
    return (
      <Alert variant="destructive">
        <AlertDescription>{t("forbidden")}</AlertDescription>
      </Alert>
    );
  if ((!accessData || !studioData) && (access.isPending || (access.isSuccess && studio.isPending)))
    return (
      <p role="status" className="flex items-center gap-2">
        <Spinner />
        {t("loading")}
      </p>
    );
  if ((!accessData || !studioData) && (access.isError || studio.isError))
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {t("loadError")}
          <Button
            variant="outline"
            onClick={() => {
              if (access.isError) void access.refetch();
              else void studio.refetch();
            }}
          >
            {common("retry")}
          </Button>
        </AlertDescription>
      </Alert>
    );
  if (!accessData || !studioData) return null;
  const manufacturer =
    accessData.business?.kind === "manufacturer" && accessData.business.status !== "suspended";
  return (
    <PrivateQueryRegion
      masked={
        !session.authorized ||
        access.isFetching ||
        !access.isSuccess ||
        studio.isFetching ||
        !studio.isSuccess
      }
      error={access.isError || studio.isError ? t("loadError") : undefined}
      retry={() => {
        if (access.isError) void access.refetch();
        else void studio.refetch();
      }}
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{t("studioTitle")}</h1>
            <p className="text-muted-foreground">{t("studioDescription")}</p>
          </div>
          {accessData.operator && (
            <Link href="/account/catalog/operations" className={buttonVariants()}>
              {t("operatorPanel")}
            </Link>
          )}
        </div>
        {manufacturer ? (
          <>
            <ProductCreator access={accessData} taxonomy={studioData.taxonomy} />
            <Card>
              <CardHeader>
                <CardTitle>{t("products")}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                {studioData.products.length ? (
                  studioData.products.map((product) => (
                    <div
                      key={product.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                    >
                      <div>
                        <p className="font-medium">
                          <bdi>{product.name}</bdi>
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {t(`statuses.${product.status}`)}
                        </p>
                      </div>
                      <Link
                        href={`/account/catalog/${product.id}`}
                        className={buttonVariants({ variant: "outline" })}
                      >
                        {t("manage")}
                      </Link>
                    </div>
                  ))
                ) : (
                  <p>{t("noProducts")}</p>
                )}
              </CardContent>
            </Card>
            <ProposalForm business={accessData.business!.id} taxonomy={studioData.taxonomy} />
            <Card>
              <CardHeader>
                <CardTitle>{t("proposalHistory")}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {studioData.proposals.length ? (
                  studioData.proposals.map((proposal) => (
                    <div key={proposal.id} className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p>
                          <bdi>{proposal.name}</bdi>
                        </p>
                        <Badge variant="secondary">
                          {t(`proposalStatuses.${proposal.status}`)}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        <bdi>{proposal.reason || proposal.description}</bdi>
                      </p>
                    </div>
                  ))
                ) : (
                  <p>{t("noProposals")}</p>
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          <Alert>
            <AlertTitle>{t("manufacturerRequired")}</AlertTitle>
            <AlertDescription>{t("manufacturerRequiredDescription")}</AlertDescription>
          </Alert>
        )}
      </div>
    </PrivateQueryRegion>
  );
}

function ProductCreator({ access, taxonomy }: { access: StudioAccess; taxonomy: Taxonomy }) {
  const t = useTranslations("catalogManagement");
  const client = useQueryClient();
  const router = useRouter();
  const [category, setCategory] = useState("");
  const [attributes, setAttributes] = useState<Record<string, unknown>>({});
  const [images, setImages] = useState<string[]>([]);
  const leaves = taxonomy.categories.filter(
    (categoryItem) =>
      categoryItem.is_active &&
      !taxonomy.categories.some(
        (candidate) => candidate.parent === categoryItem.id && candidate.is_active,
      ),
  );
  const mutation = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const data = new FormData(form);
      return saveProduct({
        business: access.business!.id,
        category,
        name: String(data.get("name")),
        description: String(data.get("description")),
        brand: String(data.get("brand")),
        manufacturer_model: String(data.get("model")),
        attributes,
        images,
      });
    },
    onSuccess: async (product) => {
      await client.invalidateQueries({ queryKey: catalogKeys.studio(access.scope) });
      setAttributes({});
      setImages([]);
      router.push(`/account/catalog/${product.id}`);
    },
  });
  const upload = useMutation({
    mutationFn: (file: File) =>
      uploadProductImage(access.business!.id, access.consent_version, file),
    onSuccess: (file) => setImages((current) => [...current, file.id]),
  });
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate(event.currentTarget);
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("newProduct")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-5" onSubmit={submit}>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="product-name">{t("name")}</FieldLabel>
              <Input id="product-name" name="name" required maxLength={200} />
            </Field>
            <Field>
              <FieldLabel htmlFor="product-category">{t("category")}</FieldLabel>
              <NativeSelect
                id="product-category"
                className="w-full"
                value={category}
                required
                onChange={(event) => {
                  setCategory(event.target.value);
                  setAttributes({});
                }}
              >
                <NativeSelectOption value="">—</NativeSelectOption>
                {leaves.map((item) => (
                  <NativeSelectOption key={item.id} value={item.id}>
                    {item.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="product-brand">{t("brand")}</FieldLabel>
              <Input id="product-brand" name="brand" maxLength={120} />
            </Field>
            <Field>
              <FieldLabel htmlFor="product-model">{t("model")}</FieldLabel>
              <Input id="product-model" name="model" maxLength={120} />
            </Field>
          </FieldGroup>
          <Field>
            <FieldLabel htmlFor="product-description">{t("description")}</FieldLabel>
            <Textarea id="product-description" name="description" required maxLength={4000} />
          </Field>
          {category && (
            <AttributeFields
              category={category}
              scope="product"
              taxonomy={taxonomy}
              value={attributes}
              onChange={setAttributes}
            />
          )}
          <Field>
            <FieldLabel htmlFor="product-images">{t("images")}</FieldLabel>
            <Input
              id="product-images"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={upload.isPending || images.length >= 8}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) upload.mutate(file);
                event.currentTarget.value = "";
              }}
            />
            <p className="text-sm text-muted-foreground">
              {t("uploadedImages", { count: images.length })}
            </p>
          </Field>
          {(mutation.isError || upload.isError) && (
            <Alert variant="destructive">
              <AlertDescription>{t("saveError")}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" disabled={mutation.isPending || upload.isPending || !category}>
            {t("createProduct")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ProposalForm({ business, taxonomy }: { business: string; taxonomy: Taxonomy }) {
  const t = useTranslations("catalogManagement");
  const client = useQueryClient();
  const [kind, setKind] = useState<"category" | "attribute" | "option">("category");
  const mutation = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const data = new FormData(form);
      return saveProposal({
        business,
        kind,
        category: kind === "attribute" ? String(data.get("category") || "") || null : null,
        attribute: kind === "option" ? String(data.get("attribute") || "") || null : null,
        name: String(data.get("name")),
        description: String(data.get("description")),
        example: String(data.get("example")),
      });
    },
    onSuccess: () => client.invalidateQueries({ queryKey: catalogKeys.management() }),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("proposalTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate(event.currentTarget);
          }}
        >
          <Field>
            <FieldLabel>{t("proposalKind")}</FieldLabel>
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
          {kind !== "category" && (
            <Field>
              <FieldLabel>{t("category")}</FieldLabel>
              <NativeSelect name="category" className="w-full" required>
                {taxonomy.categories
                  .filter((item) => item.is_active)
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
              <FieldLabel>{t("attribute")}</FieldLabel>
              <NativeSelect name="attribute" className="w-full" required>
                {taxonomy.attributes
                  .filter((item) => item.is_active)
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
            <FieldLabel>{t("description")}</FieldLabel>
            <Textarea name="description" required />
          </Field>
          <Field>
            <FieldLabel>{t("example")}</FieldLabel>
            <Textarea name="example" required />
          </Field>
          {mutation.isError && (
            <Alert variant="destructive">
              <AlertDescription>{t("saveError")}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" disabled={mutation.isPending}>
            {t("sendProposal")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

"use client";
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert/alert";
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
  const access = useQuery(studioAccessOptions());
  const studio = useQuery({
    ...studioOptions(access.data?.scope ?? "pending"),
    enabled: access.isSuccess,
  });
  if (access.isPending || studio.isPending)
    return (
      <p role="status" className="flex items-center gap-2">
        <Spinner />
        {t("loading")}
      </p>
    );
  if (access.isError || studio.isError)
    return (
      <Alert variant="destructive">
        <AlertDescription>{t("loadError")}</AlertDescription>
      </Alert>
    );
  const manufacturer = access.data.business?.kind === "manufacturer";
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("studioTitle")}</h1>
          <p className="text-muted-foreground">{t("studioDescription")}</p>
        </div>
        {access.data.operator && (
          <Button render={<Link href="/account/catalog/operations" />}>{t("operatorPanel")}</Button>
        )}
      </div>
      {manufacturer ? (
        <>
          <ProductCreator access={access.data} taxonomy={studio.data.taxonomy} />
          <Card>
            <CardHeader>
              <CardTitle>{t("products")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {studio.data.products.length ? (
                studio.data.products.map((product) => (
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
                    <Button
                      variant="outline"
                      render={<Link href={`/account/catalog/${product.id}`} />}
                    >
                      {t("manage")}
                    </Button>
                  </div>
                ))
              ) : (
                <p>{t("noProducts")}</p>
              )}
            </CardContent>
          </Card>
          <ProposalForm business={access.data.business!.id} taxonomy={studio.data.taxonomy} />
        </>
      ) : (
        <Alert>
          <AlertTitle>{t("manufacturerRequired")}</AlertTitle>
          <AlertDescription>{t("manufacturerRequiredDescription")}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function ProductCreator({ access, taxonomy }: { access: StudioAccess; taxonomy: Taxonomy }) {
  const t = useTranslations("catalogManagement");
  const client = useQueryClient();
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
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: catalogKeys.studio(access.scope) });
      setAttributes({});
      setImages([]);
    },
  });
  const upload = useMutation({
    mutationFn: (file: File) =>
      uploadProductImage(access.business!.id, access.consent_version, file),
    onSuccess: (file) => setImages((current) => [...current, file.id]),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
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
              <Input id="product-brand" name="brand" required maxLength={200} />
            </Field>
            <Field>
              <FieldLabel htmlFor="product-model">{t("model")}</FieldLabel>
              <Input id="product-model" name="model" required maxLength={200} />
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
          <Button
            type="submit"
            disabled={mutation.isPending || upload.isPending || !category || images.length === 0}
          >
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

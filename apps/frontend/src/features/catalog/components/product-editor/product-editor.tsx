"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert/alert";
import { Button } from "@/shared/ui/button/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card/card";
import { Checkbox } from "@/shared/ui/checkbox/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/shared/ui/field/field";
import { Input } from "@/shared/ui/input/input";
import { NativeSelect, NativeSelectOption } from "@/shared/ui/native-select/native-select";
import { Spinner } from "@/shared/ui/spinner/spinner";
import { Textarea } from "@/shared/ui/textarea/textarea";
import {
  deleteProduct,
  deleteVariant,
  productCommand,
  saveProduct,
  saveRevision,
  revisionCommand,
  saveSalesPlan,
  saveShipping,
  saveSupply,
  saveVariant,
  setVariantActivation,
  submitProduct,
  uploadProductImage,
} from "../../api/catalog-management.api";
import { editorOptions, studioAccessOptions } from "../../queries/catalog-management.queries";
import { catalogKeys } from "../../queries/catalog.keys";
import type {
  Editor,
  Product,
  StudioAccess,
  SupplyInput,
  Taxonomy,
  Variant,
} from "../../schemas/catalog-management.schema";
import { AttributeFields } from "../attribute-fields/attribute-fields";

export function ProductEditor({ id }: { id: string }) {
  const t = useTranslations("catalogManagement");
  const access = useQuery(studioAccessOptions());
  const editor = useQuery({
    ...editorOptions(access.data?.scope ?? "pending", id),
    enabled: access.isSuccess,
  });
  if (access.isPending || editor.isPending)
    return (
      <p role="status" className="flex items-center gap-2">
        <Spinner />
        {t("loading")}
      </p>
    );
  if (access.isError || editor.isError)
    return (
      <Alert variant="destructive">
        <AlertDescription>{t("loadError")}</AlertDescription>
      </Alert>
    );
  if (access.data.business?.id !== editor.data.product.business)
    return (
      <Alert variant="destructive">
        <AlertDescription>{t("forbidden")}</AlertDescription>
      </Alert>
    );
  return (
    <EditorWorkspace
      key={`${editor.data.product.id}:${editor.data.product.updated_at}`}
      access={access.data}
      editor={editor.data}
    />
  );
}

function EditorWorkspace({ access, editor }: { access: StudioAccess; editor: Editor }) {
  const t = useTranslations("catalogManagement");
  const client = useQueryClient();
  const router = useRouter();
  const product = editor.product;
  const editable = ["draft", "changes_requested"].includes(product.status);
  const revisionable = ["published", "inactive"].includes(product.status);
  const operational = ["draft", "changes_requested", "published", "inactive"].includes(
    product.status,
  );
  const invalidate = () =>
    client.invalidateQueries({ queryKey: catalogKeys.editor(access.scope, product.id) });
  const submit = useMutation({
    mutationFn: () => submitProduct(product.id),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: () => deleteProduct(product.id),
    onSuccess: () => router.replace("/account/catalog"),
  });
  const command = useMutation({
    mutationFn: ({
      action,
      reason,
    }: {
      action: "activate" | "deactivate" | "reopen";
      reason: string;
    }) => productCommand(action, product.id, reason),
    onSuccess: invalidate,
  });
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            <bdi>{product.name}</bdi>
          </h1>
          <p className="text-muted-foreground">{t(`statuses.${product.status}`)}</p>
        </div>
        <Button variant="outline" render={<Link href="/account/catalog" />}>
          {t("backToProducts")}
        </Button>
      </div>
      {product.decision_reason && (
        <Alert>
          <AlertTitle>{product.decision_code}</AlertTitle>
          <AlertDescription>
            <bdi>{product.decision_reason}</bdi>
          </AlertDescription>
        </Alert>
      )}
      <ProductProfile
        access={access}
        editor={editor}
        editable={editable}
        revisionable={revisionable}
        onSaved={invalidate}
      />
      <VariantsEditor access={access} editor={editor} editable={editable} onSaved={invalidate} />
      <SalesPlanEditor editor={editor} editable={operational} onSaved={invalidate} />
      <SupplyEditor editor={editor} editable={operational} onSaved={invalidate} />
      <ShippingEditor access={access} editor={editor} editable={operational} onSaved={invalidate} />
      <Card>
        <CardHeader>
          <CardTitle>{t("publication")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {editable && (
            <>
              <p className="text-sm text-muted-foreground">{t("submitHint")}</p>
              <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
                {t("submitReview")}
              </Button>
            </>
          )}
          {product.status === "published" && (
            <ReasonCommand label={t("deactivate")} action="deactivate" mutation={command} />
          )}
          {product.status === "inactive" && (
            <ReasonCommand label={t("activate")} action="activate" mutation={command} />
          )}
          {product.status === "rejected" && (
            <ReasonCommand label={t("reopen")} action="reopen" mutation={command} />
          )}
          {product.status === "draft" && (
            <Button
              variant="destructive"
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
            >
              {t("deleteDraft")}
            </Button>
          )}
          {(submit.isError || command.isError || remove.isError) && (
            <Alert variant="destructive">
              <AlertDescription>{t("commandError")}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ReasonCommand({
  label,
  action,
  mutation,
}: {
  label: string;
  action: "activate" | "deactivate" | "reopen";
  mutation: ReturnType<
    typeof useMutation<
      unknown,
      Error,
      { action: "activate" | "deactivate" | "reopen"; reason: string }
    >
  >;
}) {
  const t = useTranslations("catalogManagement");
  const [reason, setReason] = useState("");
  return (
    <div className="grid gap-3">
      <Field>
        <FieldLabel>{t("reason")}</FieldLabel>
        <Textarea value={reason} onChange={(event) => setReason(event.target.value)} />
      </Field>
      <Button
        variant="outline"
        disabled={!reason.trim() || mutation.isPending}
        onClick={() => mutation.mutate({ action, reason })}
      >
        {label}
      </Button>
    </div>
  );
}

function ProductProfile({
  access,
  editor,
  editable,
  revisionable,
  onSaved,
}: {
  access: StudioAccess;
  editor: Editor;
  editable: boolean;
  revisionable: boolean;
  onSaved: () => void;
}) {
  const t = useTranslations("catalogManagement");
  const product = editor.product;
  const changeable = editable || revisionable;
  const [attributes, setAttributes] = useState(product.attributes);
  const [images, setImages] = useState(product.images);
  const [availableImages, setAvailableImages] = useState(product.images);
  const save = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const data = new FormData(form);
      const input = {
        business: product.business,
        category: product.category,
        name: String(data.get("name")),
        description: String(data.get("description")),
        brand: String(data.get("brand")),
        manufacturer_model: String(data.get("model")),
        attributes,
        images,
      };
      if (editable) return saveProduct(input, product.id);
      if (!revisionable) throw new Error("content_locked");
      const { business: _business, ...profile } = input;
      return saveRevision(product.id, { profile });
    },
    onSuccess: onSaved,
  });
  const upload = useMutation({
    mutationFn: (file: File) => uploadProductImage(product.business, access.consent_version, file),
    onSuccess: (file) => {
      setAvailableImages((current) => [...current, file.id]);
      setImages((current) => [...current, file.id]);
    },
  });
  const submitRevision = useMutation({
    mutationFn: () => revisionCommand("revision-submit", save.data!.id),
    onSuccess: onSaved,
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{revisionable ? t("contentRevision") : t("baseProduct")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(event.currentTarget);
          }}
        >
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel>{t("name")}</FieldLabel>
              <Input name="name" defaultValue={product.name} required disabled={!changeable} />
            </Field>
            <Field>
              <FieldLabel>{t("brand")}</FieldLabel>
              <Input name="brand" defaultValue={product.brand} required disabled={!changeable} />
            </Field>
            <Field>
              <FieldLabel>{t("model")}</FieldLabel>
              <Input
                name="model"
                defaultValue={product.manufacturer_model}
                required
                disabled={!changeable}
              />
            </Field>
          </FieldGroup>
          <Field>
            <FieldLabel>{t("description")}</FieldLabel>
            <Textarea
              name="description"
              defaultValue={product.description}
              required
              disabled={!changeable}
            />
          </Field>
          <AttributeFields
            category={product.category}
            scope="product"
            taxonomy={editor.taxonomy}
            value={attributes}
            onChange={setAttributes}
            disabled={!changeable}
          />
          <Field>
            <FieldLabel>{t("images")}</FieldLabel>
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={!changeable || upload.isPending || images.length >= 8}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) upload.mutate(file);
                event.currentTarget.value = "";
              }}
            />
            <FieldDescription>{t("uploadedImages", { count: images.length })}</FieldDescription>
          </Field>
          <ImageSelection
            images={availableImages}
            selected={images}
            onChange={setImages}
            label={t("productGallery")}
            disabled={!changeable}
          />
          {(save.isError || upload.isError) && (
            <Alert variant="destructive">
              <AlertDescription>{t("saveError")}</AlertDescription>
            </Alert>
          )}
          {changeable && (
            <Button
              type="submit"
              disabled={save.isPending || upload.isPending || images.length === 0}
            >
              {editable ? t("save") : t("createRevision")}
            </Button>
          )}
          {revisionable &&
            save.data &&
            "product" in save.data &&
            save.data.status !== "pending" &&
            !submitRevision.isSuccess && (
              <Button
                type="button"
                variant="outline"
                disabled={submitRevision.isPending}
                onClick={() => submitRevision.mutate()}
              >
                {t("submitRevision")}
              </Button>
            )}
        </form>
      </CardContent>
    </Card>
  );
}

function ImageSelection({
  images,
  selected,
  onChange,
  label,
  disabled,
}: {
  images: string[];
  selected: string[];
  onChange: (images: string[]) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex flex-wrap gap-3">
        {images.map((image, index) => (
          <label key={image} className="flex items-center gap-2 rounded-lg border p-2">
            <Checkbox
              checked={selected.includes(image)}
              disabled={disabled}
              onCheckedChange={(checked) =>
                onChange(checked ? [...selected, image] : selected.filter((id) => id !== image))
              }
            />
            <span>{index + 1}</span>
          </label>
        ))}
      </div>
    </Field>
  );
}

function VariantsEditor({
  editor,
  editable,
  onSaved,
}: {
  access: StudioAccess;
  editor: Editor;
  editable: boolean;
  onSaved: () => void;
}) {
  const t = useTranslations("catalogManagement");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("variants")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5">
        {editor.variants.map((variant) => (
          <VariantForm
            key={variant.id}
            product={editor.product}
            variant={variant}
            taxonomy={editor.taxonomy}
            productImages={editor.product.images}
            editable={editable}
            onSaved={onSaved}
          />
        ))}
        {editable && (
          <VariantForm
            product={editor.product}
            taxonomy={editor.taxonomy}
            productImages={editor.product.images}
            editable
            onSaved={onSaved}
          />
        )}
      </CardContent>
    </Card>
  );
}

function VariantForm({
  product,
  variant,
  taxonomy,
  productImages,
  editable,
  onSaved,
}: {
  product: Product;
  variant?: Variant;
  taxonomy: Taxonomy;
  productImages: string[];
  editable: boolean;
  onSaved: () => void;
}) {
  const t = useTranslations("catalogManagement");
  const [attributes, setAttributes] = useState(variant?.attributes ?? {});
  const [images, setImages] = useState(variant?.images ?? []);
  const save = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      const data = new FormData(form);
      return saveVariant(
        product.id,
        { sku: String(data.get("sku")), attributes, images },
        variant?.id,
      );
    },
    onSuccess: onSaved,
  });
  const remove = useMutation({
    mutationFn: () => deleteVariant(product.id, variant!.id),
    onSuccess: onSaved,
  });
  const activation = useMutation({
    mutationFn: () =>
      setVariantActivation(product.id, variant!.id, !variant!.is_active, "producer_catalog_update"),
    onSuccess: onSaved,
  });
  if (!editable && !variant) return null;
  return (
    <form
      className="grid gap-4 rounded-lg border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(event.currentTarget);
      }}
    >
      <Field>
        <FieldLabel>{t("sku")}</FieldLabel>
        <Input name="sku" defaultValue={variant?.sku} required disabled={!editable} />
      </Field>
      <AttributeFields
        category={product.category}
        scope="variant"
        taxonomy={taxonomy}
        value={attributes}
        onChange={setAttributes}
      />
      {editable && (
        <ImageSelection
          images={productImages}
          selected={images}
          onChange={setImages}
          label={t("variantImages")}
          disabled={!editable}
        />
      )}
      <div className="flex flex-wrap gap-2">
        {editable && (
          <Button type="submit" disabled={save.isPending}>
            {variant ? t("saveVariant") : t("addVariant")}
          </Button>
        )}
        {editable && variant && (
          <Button
            type="button"
            variant="destructive"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
          >
            {t("deleteVariant")}
          </Button>
        )}
        {!editable && variant && ["published", "inactive"].includes(product.status) && (
          <Button
            type="button"
            variant="outline"
            onClick={() => activation.mutate()}
            disabled={activation.isPending}
          >
            {variant.is_active ? t("disableVariant") : t("enableVariant")}
          </Button>
        )}
      </div>
      {(save.isError || remove.isError || activation.isError) && (
        <Alert variant="destructive">
          <AlertDescription>{t("saveError")}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}

type TierDraft = { min: number; priceToman: number; overrides: Record<string, number | ""> };
type PackDraft = { code: string; name: string; quantities: Record<string, number> };

function SalesPlanEditor({
  editor,
  editable,
  onSaved,
}: {
  editor: Editor;
  editable: boolean;
  onSaved: () => void;
}) {
  const t = useTranslations("catalogManagement");
  const [freeMix, setFreeMix] = useState<number | "">(editor.sales_plan?.free_mix_min ?? "");
  const [tiers, setTiers] = useState<TierDraft[]>(
    editor.sales_plan?.tiers.map((tier) => ({
      min: tier.min_quantity,
      priceToman: tier.unit_price_irr / 10,
      overrides: Object.fromEntries(
        tier.overrides.map((item) => [item.variant, item.unit_price_irr / 10]),
      ),
    })) ?? [{ min: 1, priceToman: 1, overrides: {} }],
  );
  const [packs, setPacks] = useState<PackDraft[]>(
    editor.sales_plan?.packs.map((pack) => ({
      code: pack.code,
      name: pack.name,
      quantities: Object.fromEntries(pack.items.map((item) => [item.variant, item.quantity])),
    })) ?? [],
  );
  const save = useMutation({
    mutationFn: () =>
      saveSalesPlan(editor.product.id, {
        free_mix_min: freeMix === "" ? null : freeMix,
        packs: packs.map((pack) => ({
          code: pack.code,
          name: pack.name,
          items: Object.entries(pack.quantities)
            .filter(([, quantity]) => quantity > 0)
            .map(([variant, quantity]) => ({ variant, quantity })),
        })),
        tiers: tiers.map((tier) => ({
          min_quantity: tier.min,
          unit_price_irr: Math.round(tier.priceToman * 10),
          overrides: Object.entries(tier.overrides)
            .filter(([, price]) => price !== "" && price > 0)
            .map(([variant, price]) => ({
              variant,
              unit_price_irr: Math.round(Number(price) * 10),
            })),
        })),
      }),
    onSuccess: onSaved,
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("salesAndPricing")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5">
        <Field>
          <FieldLabel>{t("freeMixMinimum")}</FieldLabel>
          <Input
            type="number"
            min={1}
            value={freeMix}
            disabled={!editable}
            onChange={(event) => setFreeMix(event.target.value ? Number(event.target.value) : "")}
          />
          <FieldDescription>{t("freeMixHint")}</FieldDescription>
        </Field>
        <div className="grid gap-3">
          <h3 className="font-medium">{t("fixedPacks")}</h3>
          {packs.map((pack, index) => (
            <div key={index} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
              <Input
                aria-label={t("packCode")}
                placeholder={t("packCode")}
                value={pack.code}
                disabled={!editable}
                onChange={(event) =>
                  setPacks((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, code: event.target.value } : item,
                    ),
                  )
                }
              />
              <Input
                aria-label={t("packName")}
                placeholder={t("packName")}
                value={pack.name}
                disabled={!editable}
                onChange={(event) =>
                  setPacks((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, name: event.target.value } : item,
                    ),
                  )
                }
              />
              {editor.variants.map((variant) => (
                <Field key={variant.id}>
                  <FieldLabel>{variant.sku}</FieldLabel>
                  <Input
                    type="number"
                    min={0}
                    value={pack.quantities[variant.id] ?? 0}
                    disabled={!editable}
                    onChange={(event) =>
                      setPacks((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                quantities: {
                                  ...item.quantities,
                                  [variant.id]: Number(event.target.value),
                                },
                              }
                            : item,
                        ),
                      )
                    }
                  />
                </Field>
              ))}
              {editable && (
                <Button
                  variant="destructive"
                  onClick={() =>
                    setPacks((current) => current.filter((_, itemIndex) => itemIndex !== index))
                  }
                >
                  {t("remove")}
                </Button>
              )}
            </div>
          ))}
          {editable && (
            <Button
              variant="outline"
              onClick={() =>
                setPacks((current) => [...current, { code: "", name: "", quantities: {} }])
              }
            >
              {t("addPack")}
            </Button>
          )}
        </div>
        <div className="grid gap-3">
          <h3 className="font-medium">{t("priceTiers")}</h3>
          {tiers.map((tier, index) => (
            <div key={index} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
              <Field>
                <FieldLabel>{t("minimumQuantity")}</FieldLabel>
                <Input
                  type="number"
                  min={1}
                  value={tier.min}
                  disabled={!editable}
                  onChange={(event) =>
                    setTiers((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, min: Number(event.target.value) } : item,
                      ),
                    )
                  }
                />
              </Field>
              <Field>
                <FieldLabel>{t("unitPriceToman")}</FieldLabel>
                <Input
                  type="number"
                  min={1}
                  value={tier.priceToman}
                  disabled={!editable}
                  onChange={(event) =>
                    setTiers((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, priceToman: Number(event.target.value) }
                          : item,
                      ),
                    )
                  }
                />
              </Field>
              {editor.variants.map((variant) => (
                <Field key={variant.id}>
                  <FieldLabel>{t("variantOverride", { sku: variant.sku })}</FieldLabel>
                  <Input
                    type="number"
                    min={1}
                    value={tier.overrides[variant.id] ?? ""}
                    disabled={!editable}
                    onChange={(event) =>
                      setTiers((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                overrides: {
                                  ...item.overrides,
                                  [variant.id]: event.target.value
                                    ? Number(event.target.value)
                                    : "",
                                },
                              }
                            : item,
                        ),
                      )
                    }
                  />
                </Field>
              ))}
              {editable && tiers.length > 1 && (
                <Button
                  variant="destructive"
                  onClick={() =>
                    setTiers((current) => current.filter((_, itemIndex) => itemIndex !== index))
                  }
                >
                  {t("remove")}
                </Button>
              )}
            </div>
          ))}
          {editable && (
            <Button
              variant="outline"
              onClick={() =>
                setTiers((current) => [
                  ...current,
                  {
                    min: (current.at(-1)?.min ?? 0) + 1,
                    priceToman: current.at(-1)?.priceToman ?? 1,
                    overrides: {},
                  },
                ])
              }
            >
              {t("addTier")}
            </Button>
          )}
        </div>
        {save.isError && (
          <Alert variant="destructive">
            <AlertDescription>{t("saveError")}</AlertDescription>
          </Alert>
        )}
        {editable && (
          <Button
            onClick={() => save.mutate()}
            disabled={
              save.isPending ||
              editor.variants.length === 0 ||
              (freeMix === "" && packs.length === 0)
            }
          >
            {t("saveSalesPlan")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function SupplyEditor({
  editor,
  editable,
  onSaved,
}: {
  editor: Editor;
  editable: boolean;
  onSaved: () => void;
}) {
  const t = useTranslations("catalogManagement");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("supply")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {editor.variants.map((variant) => (
          <SupplyForm
            key={variant.id}
            product={editor.product.id}
            variant={variant}
            initial={editor.supplies[variant.id]}
            editable={editable}
            onSaved={onSaved}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function SupplyForm({
  product,
  variant,
  initial,
  editable,
  onSaved,
}: {
  product: string;
  variant: Variant;
  initial: SupplyInput | undefined;
  editable: boolean;
  onSaved: () => void;
}) {
  const t = useTranslations("catalogManagement");
  const [mode, setMode] = useState<SupplyInput["mode"]>(initial?.mode ?? "ready");
  const save = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      const data = new FormData(form);
      return saveSupply(product, variant.id, {
        mode,
        ready_stock: mode === "production" ? 0 : Number(data.get("ready")),
        production_cap: mode === "ready" ? 0 : Number(data.get("production")),
        lead_time_days: mode === "ready" ? 0 : Number(data.get("lead")),
      });
    },
    onSuccess: onSaved,
  });
  return (
    <form
      className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(event.currentTarget);
      }}
    >
      <h3 className="sm:col-span-2 font-medium">
        <bdi>{variant.sku}</bdi>
      </h3>
      <Field>
        <FieldLabel>{t("supplyMode")}</FieldLabel>
        <NativeSelect
          className="w-full"
          value={mode}
          disabled={!editable}
          onChange={(event) => setMode(event.target.value as SupplyInput["mode"])}
        >
          {["ready", "production", "hybrid"].map((value) => (
            <NativeSelectOption key={value} value={value}>
              {t(`supplyModes.${value}`)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field>
        <FieldLabel>{t("readyStock")}</FieldLabel>
        <Input
          name="ready"
          type="number"
          min={0}
          defaultValue={initial?.ready_stock ?? 0}
          disabled={!editable || mode === "production"}
        />
      </Field>
      <Field>
        <FieldLabel>{t("productionCapacity")}</FieldLabel>
        <Input
          name="production"
          type="number"
          min={0}
          defaultValue={initial?.production_cap ?? 0}
          disabled={!editable || mode === "ready"}
        />
      </Field>
      <Field>
        <FieldLabel>{t("leadDays")}</FieldLabel>
        <Input
          name="lead"
          type="number"
          min={0}
          defaultValue={initial?.lead_time_days ?? 0}
          disabled={!editable || mode === "ready"}
        />
      </Field>
      {save.isError && (
        <Alert variant="destructive">
          <AlertDescription>{t("saveError")}</AlertDescription>
        </Alert>
      )}
      {editable && (
        <Button type="submit" disabled={save.isPending}>
          {t("saveSupply")}
        </Button>
      )}
    </form>
  );
}

function ShippingEditor({
  access,
  editor,
  editable,
  onSaved,
}: {
  access: StudioAccess;
  editor: Editor;
  editable: boolean;
  onSaved: () => void;
}) {
  const t = useTranslations("catalogManagement");
  const [origin, setOrigin] = useState(
    editor.shipping?.origin ?? access.business?.addresses[0]?.id ?? "",
  );
  const [services, setServices] = useState(editor.shipping?.services ?? []);
  const save = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      const data = new FormData(form);
      return saveShipping(editor.product.id, {
        origin,
        services,
        packages: editor.variants.map((variant) => ({
          variant: variant.id,
          weight_g: Number(data.get(`${variant.id}:weight`)),
          length_mm: Number(data.get(`${variant.id}:length`)),
          width_mm: Number(data.get(`${variant.id}:width`)),
          height_mm: Number(data.get(`${variant.id}:height`)),
          package_count: Number(data.get(`${variant.id}:count`)),
        })),
      });
    },
    onSuccess: onSaved,
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("shipping")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(event.currentTarget);
          }}
        >
          <Field>
            <FieldLabel>{t("origin")}</FieldLabel>
            <NativeSelect
              className="w-full"
              value={origin}
              required
              disabled={!editable}
              onChange={(event) => setOrigin(event.target.value)}
            >
              {access.business?.addresses.map((address) => (
                <NativeSelectOption key={address.id} value={address.id}>
                  {address.province}، {address.city} — {address.address}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel>{t("shippingServices")}</FieldLabel>
            <div className="grid gap-2">
              {editor.services
                .filter((service) => service.is_active && service.operational)
                .map((service) => (
                  <label key={service.id} className="flex items-center gap-2 rounded-lg border p-3">
                    <Checkbox
                      checked={services.includes(service.id)}
                      disabled={!editable}
                      onCheckedChange={(checked) =>
                        setServices((current) =>
                          checked
                            ? [...current, service.id]
                            : current.filter((id) => id !== service.id),
                        )
                      }
                    />
                    <span>
                      {service.name} ({service.delivery_days_min}–{service.delivery_days_max})
                    </span>
                  </label>
                ))}
            </div>
          </Field>
          <div className="grid gap-3">
            {editor.variants.map((variant) => {
              const initial = editor.shipping?.packages.find((item) => item.variant === variant.id);
              return (
                <div key={variant.id} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-5">
                  <h3 className="sm:col-span-5 font-medium">
                    <bdi>{variant.sku}</bdi>
                  </h3>
                  {(["weight", "length", "width", "height", "count"] as const).map((name) => (
                    <Field key={name}>
                      <FieldLabel>{t(`package.${name}`)}</FieldLabel>
                      <Input
                        name={`${variant.id}:${name}`}
                        type="number"
                        min={1}
                        required
                        disabled={!editable}
                        defaultValue={
                          name === "weight"
                            ? initial?.weight_g
                            : name === "length"
                              ? initial?.length_mm
                              : name === "width"
                                ? initial?.width_mm
                                : name === "height"
                                  ? initial?.height_mm
                                  : (initial?.package_count ?? 1)
                        }
                      />
                    </Field>
                  ))}
                </div>
              );
            })}
          </div>
          {save.isError && (
            <Alert variant="destructive">
              <AlertDescription>{t("saveError")}</AlertDescription>
            </Alert>
          )}
          {editable && (
            <Button type="submit" disabled={save.isPending || !origin || services.length === 0}>
              {t("saveShipping")}
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

"use client";
import { ApiError } from "@/shared/api/unwrap";
import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCatalogWorkspaceSession } from "@/features/accounts/contracts/catalog-workspace";
import { catalogImageUrl } from "@/features/accounts/contracts/catalog-images";
import { ProductPreview } from "../product-preview/product-preview";
import { PublicationChecklist } from "../publication-checklist/publication-checklist";
import { ProductImage } from "../product-image/product-image";
import { PriceTable } from "../price-table/price-table";
import { SelectionPreview } from "../selection-preview/selection-preview";
import { quoteProducerProduct } from "../../api/catalog-quote.api";
import { tomanToIrr } from "../../utils/money";
import { useRetainedQueryData } from "@/shared/hooks/use-retained-query-data";
import { PrivateQueryRegion } from "@/shared/ui/private-query-region/private-query-region";
import { Link, useRouter } from "@/i18n/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert/alert";
import { Button } from "@/shared/ui/button/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card/card";
import { Checkbox } from "@/shared/ui/checkbox/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldLegend,
} from "@/shared/ui/field/field";
import { Input } from "@/shared/ui/input/input";
import { NativeSelect, NativeSelectOption } from "@/shared/ui/native-select/native-select";
import { Spinner } from "@/shared/ui/spinner/spinner";
import { Textarea } from "@/shared/ui/textarea/textarea";
import { Modal } from "@/shared/ui/modal/modal";
import { openModal, closeModal } from "@/shared/ui/modal/modal-history";
import { DialogTitle, DialogDescription } from "@/shared/ui/dialog/dialog";
import { buttonVariants } from "@/shared/ui/button/button.variants";
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
import { hasFieldError } from "./product-editor.validation";
import type {
  Editor,
  Product,
  StudioAccess,
  SupplyInput,
  Taxonomy,
  Variant,
  Revision,
} from "../../schemas/catalog-management.schema";
import { AttributeFields } from "../attribute-fields/attribute-fields";

export function ProductEditor({ id }: { id: string }) {
  const t = useTranslations("catalogManagement");
  const common = useTranslations("common");
  const session = useCatalogWorkspaceSession();
  const access = useQuery({ ...studioAccessOptions(session.scope), enabled: session.authorized });
  const accessData = useRetainedQueryData(access, catalogKeys.studioAccess(session.scope));
  const editor = useQuery({
    ...editorOptions(session.scope, id),
    enabled: session.authorized && access.isSuccess,
  });
  const editorData = useRetainedQueryData(editor, catalogKeys.editor(session.scope, id));
  if (
    [access.error, editor.error].some(
      (error) => error instanceof ApiError && [401, 403, 404].includes(error.status),
    )
  )
    return (
      <Alert variant="destructive">
        <AlertDescription>{t("forbidden")}</AlertDescription>
      </Alert>
    );
  if ((!accessData || !editorData) && (access.isPending || (access.isSuccess && editor.isPending)))
    return (
      <p role="status" className="flex items-center gap-2">
        <Spinner />
        {t("loading")}
      </p>
    );
  if ((!accessData || !editorData) && (access.isError || editor.isError))
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {t("loadError")}
          <Button
            variant="outline"
            onClick={() => {
              if (access.isError) void access.refetch();
              else void editor.refetch();
            }}
          >
            {common("retry")}
          </Button>
        </AlertDescription>
      </Alert>
    );
  if (!accessData || !editorData) return null;
  if (accessData.business?.id !== editorData.product.business)
    return (
      <Alert variant="destructive">
        <AlertDescription>{t("forbidden")}</AlertDescription>
      </Alert>
    );
  return (
    <PrivateQueryRegion
      masked={
        !session.authorized ||
        access.isFetching ||
        !access.isSuccess ||
        editor.isFetching ||
        !editor.isSuccess
      }
      error={access.isError || editor.isError ? t("loadError") : undefined}
      retry={() => {
        if (access.isError) void access.refetch();
        else void editor.refetch();
      }}
    >
      <EditorWorkspace
        key={editorData.product.id}
        access={accessData}
        editor={editorData}
        previewEnabled={
          session.authorized &&
          access.isSuccess &&
          !access.isFetching &&
          editor.isSuccess &&
          !editor.isFetching
        }
      />
    </PrivateQueryRegion>
  );
}

function EditorWorkspace({
  access,
  editor,
  previewEnabled,
}: {
  access: StudioAccess;
  editor: Editor;
  previewEnabled: boolean;
}) {
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
    onError: () => {
      void invalidate();
    },
    onSuccess: async () => {
      await invalidate();
      closeModal();
    },
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
        <Button nativeButton={false} variant="outline" render={<Link href="/account/catalog" />}>
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
      <nav aria-label={t("editorNavigation")} className="flex flex-wrap gap-2">
        {(
          [
            "baseProduct",
            "variants",
            "salesAndPricing",
            "supply",
            "shipping",
            "preview",
            "publication",
          ] as const
        ).map((section) => (
          <Link
            key={section}
            href={`#${section}`}
            className={buttonVariants({ variant: "outline" })}
          >
            {section === "preview" ? t("preview.title") : t(section)}
          </Link>
        ))}
      </nav>
      <section id="baseProduct" className="scroll-mt-6">
        <ProductProfile
          key={JSON.stringify([
            product.category,
            product.name,
            product.description,
            product.brand,
            product.manufacturer_model,
            product.attributes,
            product.images,
            editor.revisions,
          ])}
          access={access}
          editor={editor}
          editable={editable}
          revisionable={revisionable}
          onSaved={invalidate}
        />
      </section>
      <section id="variants" className="scroll-mt-6">
        <VariantsEditor access={access} editor={editor} editable={editable} onSaved={invalidate} />
      </section>
      <section id="salesAndPricing" className="grid scroll-mt-6 gap-6">
        <SalesPlanEditor
          key={JSON.stringify(editor.sales_plan)}
          editor={editor}
          editable={operational}
          onSaved={invalidate}
        />
        {operational && editor.sales_plan && (
          <SelectionPreview
            scope={access.scope}
            productId={product.id}
            plan={editor.sales_plan}
            variants={editor.variants
              .filter((variant) => variant.is_active)
              .map((variant) => ({
                id: variant.id,
                sku: variant.sku,
                supply: editor.supplies[variant.id] ?? null,
                orderable:
                  (editor.supplies[variant.id]?.ready_stock ?? 0) +
                    (editor.supplies[variant.id]?.production_cap ?? 0) >
                  0,
              }))}
            quote={quoteProducerProduct}
          />
        )}
      </section>
      <section id="supply" className="scroll-mt-6">
        <SupplyEditor editor={editor} editable={operational} onSaved={invalidate} />
      </section>
      <section id="shipping" className="scroll-mt-6">
        <ShippingEditor
          key={JSON.stringify([editor.shipping, editor.variants.map((variant) => variant.id)])}
          access={access}
          editor={editor}
          editable={operational}
          onSaved={invalidate}
        />
      </section>
      <section id="preview" className="scroll-mt-6">
        <ProductPreview scope={access.scope} id={product.id} enabled={previewEnabled} />
      </section>
      <Card id="publication">
        <CardHeader>
          <CardTitle>{t("publication")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <PublicationChecklist readiness={editor.readiness} links />
          {editable && (
            <>
              <p className="text-sm text-muted-foreground">{t("submitHint")}</p>
              <Button
                onClick={() => openModal("catalog-submit")}
                disabled={
                  submit.isPending ||
                  !editor.readiness.ready ||
                  access.business?.status !== "verified"
                }
              >
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
          {product.status === "rejected" && access.operator && (
            <ReasonCommand label={t("reopen")} action="reopen" mutation={command} />
          )}
          {product.status === "draft" && !product.submitted_at && (
            <Button
              variant="destructive"
              onClick={() => openModal("catalog-delete")}
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
      <Modal name="catalog-submit" labelledBy="catalog-submit-title">
        <DialogTitle id="catalog-submit-title">{t("submitReview")}</DialogTitle>
        <DialogDescription>{t("submitHint")}</DialogDescription>
        <Button
          disabled={
            submit.isPending ||
            !editable ||
            !editor.readiness.ready ||
            access.business?.status !== "verified"
          }
          onClick={() => submit.mutate()}
        >
          {t("confirmSubmit")}
        </Button>
        {submit.isError && (
          <Alert variant="destructive">
            <AlertDescription>{t("commandError")}</AlertDescription>
          </Alert>
        )}
      </Modal>
      <Modal name="catalog-delete" labelledBy="catalog-delete-title">
        <DialogTitle id="catalog-delete-title">{t("deleteDraft")}</DialogTitle>
        <DialogDescription>{t("deleteDraftHint")}</DialogDescription>
        <Button
          variant="destructive"
          disabled={remove.isPending || product.status !== "draft" || Boolean(product.submitted_at)}
          onClick={() => remove.mutate()}
        >
          {t("confirmDelete")}
        </Button>
        {remove.isError && (
          <Alert variant="destructive">
            <AlertDescription>{t("commandError")}</AlertDescription>
          </Alert>
        )}
      </Modal>
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
  const fieldId = useId();
  const [reason, setReason] = useState("");
  return (
    <div className="grid gap-3">
      <Field>
        <FieldLabel htmlFor={fieldId}>{t("reason")}</FieldLabel>
        <Textarea id={fieldId} value={reason} onChange={(event) => setReason(event.target.value)} />
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
  const fieldId = useId();
  const product = editor.product;
  const revision = editor.revisions.find((item) =>
    ["draft", "pending", "changes_requested"].includes(item.status),
  );
  const profile = revision?.proposed.profile ?? product;
  const changeable = editable || (revisionable && revision?.status !== "pending");
  const [category, setCategory] = useState(profile.category);
  const [attributes, setAttributes] = useState(profile.attributes);
  const [images, setImages] = useState(profile.images);
  const [availableImages, setAvailableImages] = useState([
    ...new Set([...product.images, ...profile.images]),
  ]);
  const [revisionVariants, setRevisionVariants] = useState<RevisionVariantDraft[]>(
    (
      revision?.proposed.variants ??
      editor.variants
        .filter((variant) => variant.is_active)
        .map(({ id, sku, attributes, images }) => ({ id, sku, attributes, images }))
    ).map((variant) => ({ ...variant, clientKey: variant.id })),
  );
  const [uploadingVariants, setUploadingVariants] = useState<string[]>([]);
  const save = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const data = new FormData(form);
      const input = {
        business: product.business,
        category,
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
      return saveRevision(
        product.id,
        { profile, variants: revisionVariants.map(({ clientKey: _key, ...variant }) => variant) },
        revision?.id,
      );
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
    mutationFn: () => revisionCommand("revision-submit", revision!.id),
    onSuccess: onSaved,
  });
  const [cancelReason, setCancelReason] = useState("");
  const cancelRevision = useMutation({
    mutationFn: () => revisionCommand("revision-cancel", revision!.id, { reason: cancelReason }),
    onSuccess: onSaved,
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{revisionable ? t("contentRevision") : t("baseProduct")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          aria-label={revisionable ? t("contentRevision") : t("baseProduct")}
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(event.currentTarget);
          }}
        >
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`${fieldId}-name`}>{t("name")}</FieldLabel>
              <Input
                id={`${fieldId}-name`}
                name="name"
                aria-label={t("name")}
                defaultValue={profile.name}
                required
                disabled={!changeable}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${fieldId}-brand`}>{t("brand")}</FieldLabel>
              <Input
                id={`${fieldId}-brand`}
                name="brand"
                aria-label={t("brand")}
                defaultValue={profile.brand}
                maxLength={120}
                disabled={!changeable}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${fieldId}-model`}>{t("model")}</FieldLabel>
              <Input
                id={`${fieldId}-model`}
                name="model"
                aria-label={t("model")}
                defaultValue={profile.manufacturer_model}
                maxLength={120}
                disabled={!changeable}
              />
            </Field>
          </FieldGroup>
          <Field>
            <FieldLabel htmlFor="editor-category">{t("category")}</FieldLabel>
            <NativeSelect
              id="editor-category"
              className="w-full"
              value={category}
              disabled={!changeable}
              onChange={(event) => {
                setCategory(event.target.value);
                setAttributes({});
              }}
            >
              {editor.taxonomy.categories
                .filter(
                  (item) =>
                    item.id === category ||
                    (item.is_active &&
                      !editor.taxonomy.categories.some((child) => child.parent === item.id)),
                )
                .map((item) => (
                  <NativeSelectOption key={item.id} value={item.id}>
                    {item.name}
                  </NativeSelectOption>
                ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${fieldId}-description`}>{t("description")}</FieldLabel>
            <Textarea
              id={`${fieldId}-description`}
              name="description"
              aria-label={t("description")}
              defaultValue={profile.description}
              required
              disabled={!changeable}
            />
          </Field>
          <AttributeFields
            category={category}
            scope="product"
            taxonomy={editor.taxonomy}
            value={attributes}
            onChange={setAttributes}
            disabled={!changeable}
          />
          <Field>
            <FieldLabel htmlFor={`${fieldId}-images`}>{t("images")}</FieldLabel>
            <Input
              id={`${fieldId}-images`}
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
          {revisionable && (
            <FieldGroup>
              <h3 className="font-medium">{t("revisionVariants")}</h3>
              <p className="text-sm text-muted-foreground">{t("revisionVariantsHint")}</p>
              {revisionVariants.map((variant) => (
                <RevisionVariantFields
                  key={variant.clientKey}
                  access={access}
                  category={category}
                  taxonomy={editor.taxonomy}
                  variant={variant}
                  images={availableImages}
                  disabled={!changeable}
                  onChange={(next) =>
                    setRevisionVariants((current) =>
                      current.map((item) => (item.clientKey === variant.clientKey ? next : item)),
                    )
                  }
                  onUploaded={(id) =>
                    setRevisionVariants((current) =>
                      current.map((item) =>
                        item.clientKey === variant.clientKey
                          ? { ...item, images: [...item.images, id] }
                          : item,
                      ),
                    )
                  }
                  onUploading={(pending) =>
                    setUploadingVariants((current) =>
                      pending
                        ? [...current, variant.clientKey]
                        : current.filter((key) => key !== variant.clientKey),
                    )
                  }
                  onRemove={() =>
                    setRevisionVariants((current) =>
                      current.filter((item) => item.clientKey !== variant.clientKey),
                    )
                  }
                />
              ))}
              {changeable && (
                <Button
                  variant="outline"
                  onClick={() =>
                    setRevisionVariants((current) => [
                      ...current,
                      {
                        clientKey: crypto.randomUUID(),
                        sku: "",
                        attributes: {},
                        images: [],
                        supply: {
                          mode: "ready",
                          ready_stock: 0,
                          production_cap: 0,
                          lead_time_days: 0,
                        },
                        package: {
                          weight_g: 0,
                          length_mm: 0,
                          width_mm: 0,
                          height_mm: 0,
                          package_count: 1,
                        },
                      },
                    ])
                  }
                >
                  {t("addVariant")}
                </Button>
              )}
            </FieldGroup>
          )}
          {(save.isError || upload.isError || submitRevision.isError || cancelRevision.isError) && (
            <Alert variant="destructive">
              <AlertDescription>{t("saveError")}</AlertDescription>
            </Alert>
          )}
          {changeable && (
            <Button
              type="submit"
              disabled={
                save.isPending ||
                upload.isPending ||
                uploadingVariants.length > 0 ||
                images.length === 0
              }
            >
              {editable || revision ? t("save") : t("createRevision")}
            </Button>
          )}
          {revisionable &&
            revision &&
            revision.status !== "pending" &&
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
          {revision && (
            <>
              <p role="status">{t(`revisionStatuses.${revision.status}`)}</p>
              {revision.reason && (
                <Alert>
                  <AlertDescription>
                    <bdi>{revision.reason}</bdi>
                  </AlertDescription>
                </Alert>
              )}
              <Field>
                <FieldLabel htmlFor="revision-cancel-reason">{t("reason")}</FieldLabel>
                <Textarea
                  id="revision-cancel-reason"
                  value={cancelReason}
                  onChange={(event) => setCancelReason(event.target.value)}
                />
              </Field>
              <Button
                variant="outline"
                disabled={cancelRevision.isPending || !cancelReason.trim()}
                onClick={() => cancelRevision.mutate()}
              >
                {t("cancelRevision")}
              </Button>
            </>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

type RevisionVariantDraft = Omit<Revision["proposed"]["variants"][number], "id"> & {
  id?: string;
  clientKey: string;
};

function RevisionVariantFields({
  access,
  category,
  taxonomy,
  variant,
  images,
  disabled,
  onChange,
  onUploaded,
  onUploading,
  onRemove,
}: {
  access: StudioAccess;
  category: string;
  taxonomy: Taxonomy;
  variant: RevisionVariantDraft;
  images: string[];
  disabled: boolean;
  onChange: (variant: RevisionVariantDraft) => void;
  onUploaded: (id: string) => void;
  onUploading: (pending: boolean) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("catalogManagement");
  const id = useId();
  const upload = useMutation({
    mutationFn: (file: File) =>
      uploadProductImage(access.business!.id, access.consent_version, file),
    onMutate: () => onUploading(true),
    onSuccess: (file) => onUploaded(file.id),
    onSettled: () => onUploading(false),
  });
  const supply = variant.supply,
    pack = variant.package;
  return (
    <FieldSet>
      <FieldLegend>{variant.sku || t("newVariant")}</FieldLegend>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`${id}-sku`}>{t("sku")}</FieldLabel>
          <Input
            id={`${id}-sku`}
            value={variant.sku}
            required
            maxLength={100}
            disabled={disabled}
            onChange={(event) => onChange({ ...variant, sku: event.target.value })}
          />
        </Field>
        <AttributeFields
          category={category}
          scope="variant"
          taxonomy={taxonomy}
          value={variant.attributes}
          disabled={disabled}
          onChange={(attributes) => onChange({ ...variant, attributes })}
        />
        <Field>
          <FieldLabel htmlFor={`${id}-image`}>{t("variantImages")}</FieldLabel>
          <Input
            id={`${id}-image`}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={disabled || upload.isPending || variant.images.length >= 3}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) upload.mutate(file);
              event.currentTarget.value = "";
            }}
          />
        </Field>
        <ImageSelection
          images={[...new Set([...images, ...variant.images])]}
          selected={variant.images}
          onChange={(next) => onChange({ ...variant, images: next })}
          label={t("variantImages")}
          disabled={disabled || upload.isPending}
          limit={3}
        />
        {supply && (
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`${id}-mode`}>{t("supplyMode")}</FieldLabel>
              <NativeSelect
                id={`${id}-mode`}
                className="w-full"
                value={supply.mode}
                disabled={disabled}
                onChange={(event) => {
                  const mode = event.target.value;
                  if (mode !== "ready" && mode !== "production" && mode !== "hybrid") return;
                  onChange({
                    ...variant,
                    supply: {
                      ...supply,
                      mode,
                      ready_stock: mode === "production" ? 0 : supply.ready_stock,
                      production_cap: mode === "ready" ? 0 : supply.production_cap,
                      lead_time_days: mode === "ready" ? 0 : supply.lead_time_days,
                    },
                  });
                }}
              >
                {(["ready", "production", "hybrid"] as const).map((mode) => (
                  <NativeSelectOption key={mode} value={mode}>
                    {t(`supplyModes.${mode}`)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            {(
              [
                ["ready_stock", "readyStock"],
                ["production_cap", "productionCapacity"],
                ["lead_time_days", "leadDays"],
              ] as const
            ).map(([key, label]) => (
              <Field key={key}>
                <FieldLabel htmlFor={`${id}-${key}`}>{t(label)}</FieldLabel>
                <Input
                  id={`${id}-${key}`}
                  type="number"
                  value={supply[key]}
                  min={key === "ready_stock" ? 0 : 1}
                  max={key === "lead_time_days" ? 3650 : 1_000_000_000}
                  required
                  disabled={
                    disabled ||
                    (key === "ready_stock" ? supply.mode === "production" : supply.mode === "ready")
                  }
                  onChange={(event) =>
                    onChange({
                      ...variant,
                      supply: { ...supply, [key]: Number(event.target.value) },
                    })
                  }
                />
              </Field>
            ))}
          </FieldGroup>
        )}
        {pack && (
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ["weight_g", "weight"],
                ["length_mm", "length"],
                ["width_mm", "width"],
                ["height_mm", "height"],
                ["package_count", "count"],
              ] as const
            ).map(([key, label]) => (
              <Field key={key}>
                <FieldLabel htmlFor={`${id}-${key}`}>{t(`package.${label}`)}</FieldLabel>
                <Input
                  id={`${id}-${key}`}
                  type="number"
                  min={1}
                  required
                  value={pack[key]}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange({
                      ...variant,
                      package: { ...pack, [key]: Number(event.target.value) },
                    })
                  }
                />
              </Field>
            ))}
          </FieldGroup>
        )}
        {upload.isError && (
          <Alert variant="destructive">
            <AlertDescription>{t("saveError")}</AlertDescription>
          </Alert>
        )}
        {!disabled && (
          <Button variant="outline" onClick={onRemove} disabled={upload.isPending}>
            {t("removeVariantFromRevision")}
          </Button>
        )}
      </FieldGroup>
    </FieldSet>
  );
}

function ImageSelection({
  images,
  selected,
  onChange,
  label,
  disabled,
  limit = 8,
}: {
  images: string[];
  selected: string[];
  onChange: (images: string[]) => void;
  label: string;
  disabled?: boolean;
  limit?: number;
}) {
  const t = useTranslations("catalogManagement");
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <div className="grid gap-3 sm:grid-cols-3">
        {[...selected, ...images.filter((image) => !selected.includes(image))].map(
          (image, index) => (
            <div key={image} className="flex flex-col gap-2">
              <ProductImage
                src={catalogImageUrl(image)}
                alt={t("imageNumber", { number: index + 1 })}
                fallback={t("imageNumber", { number: index + 1 })}
                sizes="160px"
              />
              <FieldLabel className="min-h-11">
                <Checkbox
                  checked={selected.includes(image)}
                  disabled={disabled || (!selected.includes(image) && selected.length >= limit)}
                  onCheckedChange={(checked) =>
                    onChange(checked ? [...selected, image] : selected.filter((id) => id !== image))
                  }
                />
                {selected[0] === image ? t("mainImage") : t("imageNumber", { number: index + 1 })}
              </FieldLabel>
              {selected.includes(image) && !disabled && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={selected.indexOf(image) === 0}
                    onClick={() => {
                      const order = [...selected],
                        position = order.indexOf(image);
                      order.splice(position, 1);
                      order.splice(position - 1, 0, image);
                      onChange(order);
                    }}
                  >
                    {t("moveImageEarlier")}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={selected.indexOf(image) === selected.length - 1}
                    onClick={() => {
                      const order = [...selected],
                        position = order.indexOf(image);
                      order.splice(position, 1);
                      order.splice(position + 1, 0, image);
                      onChange(order);
                    }}
                  >
                    {t("moveImageLater")}
                  </Button>
                </div>
              )}
            </div>
          ),
        )}
      </div>
    </Field>
  );
}

function VariantsEditor({
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
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("variants")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5">
        {editor.variants.map((variant) => (
          <VariantForm
            key={JSON.stringify(variant)}
            product={editor.product}
            access={access}
            variant={variant}
            taxonomy={editor.taxonomy}
            productImages={editor.product.images}
            editable={editable}
            onSaved={onSaved}
          />
        ))}
        {editable && (
          <VariantForm
            key={editor.variants.length}
            product={editor.product}
            access={access}
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
  access,
  product,
  variant,
  taxonomy,
  productImages,
  editable,
  onSaved,
}: {
  product: Product;
  access: StudioAccess;
  variant?: Variant;
  taxonomy: Taxonomy;
  productImages: string[];
  editable: boolean;
  onSaved: () => void;
}) {
  const t = useTranslations("catalogManagement");
  const fieldId = useId();
  const [attributes, setAttributes] = useState(variant?.attributes ?? {});
  const [images, setImages] = useState(variant?.images ?? []);
  const [availableImages, setAvailableImages] = useState([
    ...new Set([...productImages, ...images]),
  ]);
  const upload = useMutation({
    mutationFn: (file: File) => uploadProductImage(product.business, access.consent_version, file),
    onSuccess: (file) => {
      setAvailableImages((current) => [...current, file.id]);
      setImages((current) => [...current, file.id]);
    },
  });
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
  const [activationReason, setActivationReason] = useState("");
  const activation = useMutation({
    mutationFn: () =>
      setVariantActivation(product.id, variant!.id, !variant!.is_active, activationReason),
    onSuccess: onSaved,
  });
  if (!editable && !variant) return null;
  return (
    <form
      aria-label={variant?.sku ?? t("newVariant")}
      className="grid gap-4 rounded-lg border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(event.currentTarget);
      }}
    >
      <Field>
        <FieldLabel htmlFor={`${fieldId}-sku`}>{t("sku")}</FieldLabel>
        <Input
          id={`${fieldId}-sku`}
          name="sku"
          defaultValue={variant?.sku}
          required
          disabled={!editable}
        />
      </Field>
      <AttributeFields
        category={product.category}
        scope="variant"
        taxonomy={taxonomy}
        value={attributes}
        onChange={setAttributes}
        disabled={!editable}
      />
      {editable && (
        <Field>
          <FieldLabel htmlFor={`${fieldId}-images`}>{t("variantImages")}</FieldLabel>
          <Input
            id={`${fieldId}-images`}
            type="file"
            aria-label={t("variantImages")}
            accept="image/jpeg,image/png,image/webp"
            disabled={upload.isPending || images.length >= 3}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) upload.mutate(file);
              event.currentTarget.value = "";
            }}
          />
        </Field>
      )}
      {editable && (
        <ImageSelection
          images={availableImages}
          selected={images}
          onChange={setImages}
          label={t("variantImages")}
          disabled={!editable}
          limit={3}
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
          <Field>
            <FieldLabel htmlFor={`${fieldId}-reason`}>{t("reason")}</FieldLabel>
            <Textarea
              id={`${fieldId}-reason`}
              aria-label={t("variantStatusReason", { sku: variant.sku })}
              value={activationReason}
              onChange={(event) => setActivationReason(event.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => activation.mutate()}
              disabled={
                activation.isPending ||
                !activationReason.trim() ||
                (!variant.is_active &&
                  (variant.disabled_code === "revision_removed" ||
                    (variant.disabled_code === "operator_disabled" && !access.operator)))
              }
            >
              {variant.is_active ? t("disableVariant") : t("enableVariant")}
            </Button>
            {variant.status_reason && (
              <p className="text-sm text-muted-foreground">
                <bdi>{variant.status_reason}</bdi>
              </p>
            )}
          </Field>
        )}
      </div>
      {(save.isError || remove.isError || activation.isError || upload.isError) && (
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
  const fieldId = useId();
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
    mutationFn: (_form: HTMLFormElement) =>
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
          unit_price_irr: tomanToIrr(tier.priceToman),
          overrides: Object.entries(tier.overrides)
            .filter(([, price]) => price !== "")
            .map(([variant, price]) => ({
              variant,
              unit_price_irr: tomanToIrr(Number(price)),
            })),
        })),
      }),
    onSuccess: onSaved,
    onError: (error, form) => {
      [...form.querySelectorAll<HTMLInputElement>("input[name]")]
        .find((input) => hasFieldError(error, input.name))
        ?.focus();
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("salesAndPricing")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          aria-label={t("salesAndPricing")}
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(event.currentTarget);
          }}
          onChangeCapture={() => {
            if (save.isError) save.reset();
          }}
        >
          <Field>
            <FieldLabel htmlFor={`${fieldId}-minimum`}>{t("freeMixMinimum")}</FieldLabel>
            <Input
              id={`${fieldId}-minimum`}
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
                <Field data-invalid={hasFieldError(save.error, `packs.${index}.code`)}>
                  <Input
                    aria-label={t("packCode")}
                    name={`packs.${index}.code`}
                    aria-invalid={hasFieldError(save.error, `packs.${index}.code`)}
                    aria-describedby={`${fieldId}-pack-${index}-code-error`}
                    pattern="[a-zA-Z0-9_-]+"
                    maxLength={60}
                    required
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
                  {hasFieldError(save.error, `packs.${index}.code`) && (
                    <FieldError id={`${fieldId}-pack-${index}-code-error`}>
                      {t("pricingValidation.packCode")}
                    </FieldError>
                  )}
                </Field>
                <Input
                  aria-label={t("packName")}
                  maxLength={120}
                  required
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
                    <FieldLabel htmlFor={`${fieldId}-pack-${index}-${variant.id}`}>
                      {variant.sku}
                    </FieldLabel>
                    <Input
                      id={`${fieldId}-pack-${index}-${variant.id}`}
                      name={`packs.${index}.items`}
                      aria-invalid={hasFieldError(save.error, `packs.${index}.items`)}
                      aria-describedby={`${fieldId}-pack-${index}-items-error`}
                      type="number"
                      min={0}
                      max={1_000_000_000}
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
                {hasFieldError(save.error, `packs.${index}.items`) && (
                  <FieldError id={`${fieldId}-pack-${index}-items-error`}>
                    {t("pricingValidation.packItems")}
                  </FieldError>
                )}
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
                <Field data-invalid={hasFieldError(save.error, `tiers.${index}.min_quantity`)}>
                  <FieldLabel htmlFor={`${fieldId}-tier-${index}-minimum`}>
                    {t("minimumQuantity")}
                  </FieldLabel>
                  <Input
                    id={`${fieldId}-tier-${index}-minimum`}
                    name={`tiers.${index}.min_quantity`}
                    aria-invalid={hasFieldError(save.error, `tiers.${index}.min_quantity`)}
                    aria-describedby={`${fieldId}-tier-${index}-minimum-error`}
                    required
                    type="number"
                    min={1}
                    max={1_000_000_000}
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
                  {hasFieldError(save.error, `tiers.${index}.min_quantity`) && (
                    <FieldError id={`${fieldId}-tier-${index}-minimum-error`}>
                      {t("pricingValidation.minimum")}
                    </FieldError>
                  )}
                </Field>
                <Field data-invalid={hasFieldError(save.error, `tiers.${index}.unit_price_irr`)}>
                  <FieldLabel htmlFor={`${fieldId}-tier-${index}-price`}>
                    {t("unitPriceToman")}
                  </FieldLabel>
                  <Input
                    id={`${fieldId}-tier-${index}-price`}
                    name={`tiers.${index}.unit_price_irr`}
                    aria-invalid={hasFieldError(save.error, `tiers.${index}.unit_price_irr`)}
                    aria-describedby={`${fieldId}-tier-${index}-price-error`}
                    required
                    type="number"
                    min={1}
                    max={100_000_000_000_000}
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
                  {hasFieldError(save.error, `tiers.${index}.unit_price_irr`) && (
                    <FieldError id={`${fieldId}-tier-${index}-price-error`}>
                      {t("pricingValidation.price")}
                    </FieldError>
                  )}
                </Field>
                {editor.variants.map((variant) => (
                  <Field
                    key={variant.id}
                    data-invalid={hasFieldError(
                      save.error,
                      `tiers.${index}.overrides.${variant.id}.unit_price_irr`,
                    )}
                  >
                    <FieldLabel htmlFor={`${fieldId}-tier-${index}-${variant.id}`}>
                      {t("variantOverride", { sku: variant.sku })}
                    </FieldLabel>
                    <Input
                      id={`${fieldId}-tier-${index}-${variant.id}`}
                      name={`tiers.${index}.overrides.${variant.id}.unit_price_irr`}
                      aria-invalid={hasFieldError(
                        save.error,
                        `tiers.${index}.overrides.${variant.id}.unit_price_irr`,
                      )}
                      aria-describedby={`${fieldId}-tier-${index}-${variant.id}-error`}
                      type="number"
                      min={1}
                      max={100_000_000_000_000}
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
                    {hasFieldError(
                      save.error,
                      `tiers.${index}.overrides.${variant.id}.unit_price_irr`,
                    ) && (
                      <FieldError id={`${fieldId}-tier-${index}-${variant.id}-error`}>
                        {t("pricingValidation.override")}
                      </FieldError>
                    )}
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
              type="submit"
              disabled={
                save.isPending ||
                editor.variants.length === 0 ||
                (freeMix === "" && packs.length === 0)
              }
            >
              {t("saveSalesPlan")}
            </Button>
          )}
          {editor.sales_plan && (
            <section className="grid gap-3" aria-label={t("finalPriceTable")}>
              <h3 className="font-medium">{t("finalPriceTable")}</h3>
              <p className="text-sm text-muted-foreground">{t("finalPriceTableHint")}</p>
              <PriceTable
                tiers={editor.sales_plan.tiers}
                variants={editor.variants.filter((variant) => variant.is_active)}
                caption={t("finalPriceTable")}
              />
            </section>
          )}
        </form>
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
            key={`${variant.id}:${JSON.stringify(editor.supplies[variant.id])}`}
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
  const fieldId = useId();
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
      aria-label={variant.sku}
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
        <FieldLabel htmlFor={`${fieldId}-mode`}>{t("supplyMode")}</FieldLabel>
        <NativeSelect
          id={`${fieldId}-mode`}
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
        <FieldLabel htmlFor={`${fieldId}-ready`}>{t("readyStock")}</FieldLabel>
        <Input
          id={`${fieldId}-ready`}
          name="ready"
          type="number"
          min={0}
          defaultValue={initial?.ready_stock ?? 0}
          disabled={!editable || mode === "production"}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${fieldId}-production`}>{t("productionCapacity")}</FieldLabel>
        <Input
          id={`${fieldId}-production`}
          name="production"
          type="number"
          min={0}
          defaultValue={initial?.production_cap ?? 0}
          disabled={!editable || mode === "ready"}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${fieldId}-lead`}>{t("leadDays")}</FieldLabel>
        <Input
          id={`${fieldId}-lead`}
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
  const fieldId = useId();
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
          aria-label={t("shipping")}
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(event.currentTarget);
          }}
        >
          <Field>
            <FieldLabel htmlFor={`${fieldId}-origin`}>{t("origin")}</FieldLabel>
            <NativeSelect
              id={`${fieldId}-origin`}
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
                      <FieldLabel htmlFor={`${fieldId}-${variant.id}-${name}`}>
                        {t(`package.${name}`)}
                      </FieldLabel>
                      <Input
                        id={`${fieldId}-${variant.id}-${name}`}
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

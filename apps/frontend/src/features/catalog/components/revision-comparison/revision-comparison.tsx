"use client";
import type { ReactNode } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/shared/ui/card/card";
import { Badge } from "@/shared/ui/badge/badge";
import { catalogImageUrl } from "@/features/accounts/contracts/catalog-images";
import { ProductGallery } from "../product-gallery/product-gallery";
import { VariantPackageDetails } from "../variant-package-details/variant-package-details";
import { attributeValueText } from "../../utils/attribute-value-text";
import type { Revision, Taxonomy } from "../../schemas/catalog-management.schema";
import type { RevisionComparisonProps } from "./revision-comparison.types";

function same(left: unknown, right: unknown) {
  const canonical = (value: unknown) =>
    JSON.stringify(value, (_key, item: unknown) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
        : item,
    );
  return canonical(left) === canonical(right);
}
export function RevisionComparison({ revision, taxonomy }: RevisionComparisonProps) {
  const t = useTranslations("catalogManagement");
  const { before, proposed } = revision;
  const variants = [
    ...new Set([
      ...before.variants.map((row) => row.id),
      ...proposed.variants.map((row) => row.id),
    ]),
  ];
  return (
    <section aria-label={t("revisionDiff.title")} className="grid min-w-0 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t("revisionDiff.title")}</h2>
          </CardTitle>
          <CardDescription>{t("revisionDiff.description")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          {(["name", "description", "brand", "manufacturer_model", "category"] as const).map(
            (key) => (
              <Difference
                key={key}
                title={t(key === "manufacturer_model" ? "model" : key)}
                changed={!same(before.profile[key], proposed.profile[key])}
                before={
                  key === "category"
                    ? (taxonomy.categories.find((row) => row.id === before.profile.category)
                        ?.name ?? before.profile.category)
                    : before.profile[key] || t("revisionDiff.empty")
                }
                proposed={
                  key === "category"
                    ? (taxonomy.categories.find((row) => row.id === proposed.profile.category)
                        ?.name ?? proposed.profile.category)
                    : proposed.profile[key] || t("revisionDiff.empty")
                }
              />
            ),
          )}
          <Difference
            title={t("revisionDiff.attributes")}
            changed={!same(before.profile.attributes, proposed.profile.attributes)}
            before={
              <Attributes
                value={before.profile.attributes}
                category={before.profile.category}
                scope="product"
                taxonomy={taxonomy}
              />
            }
            proposed={
              <Attributes
                value={proposed.profile.attributes}
                category={proposed.profile.category}
                scope="product"
                taxonomy={taxonomy}
              />
            }
          />
          <Difference
            title={t("images")}
            changed={!same(before.profile.images, proposed.profile.images)}
            before={<Images name={before.profile.name} ids={before.profile.images} />}
            proposed={<Images name={proposed.profile.name} ids={proposed.profile.images} />}
          />
        </CardContent>
      </Card>
      {variants.map((id) => {
        const old = before.variants.find((row) => row.id === id),
          next = proposed.variants.find((row) => row.id === id);
        const status = !old
          ? "added"
          : !next
            ? "removed"
            : same(old, next)
              ? "unchanged"
              : "changed";
        return (
          <Card key={id} role="region" aria-label={next?.sku ?? old?.sku}>
            <CardHeader>
              <CardTitle>
                <h3>
                  <bdi>{next?.sku ?? old?.sku}</bdi>
                </h3>
              </CardTitle>
              <Badge variant={status === "unchanged" ? "outline" : "secondary"}>
                {t(`revisionDiff.${status}`)}
              </Badge>
            </CardHeader>
            <CardContent>
              <Difference
                title={t("variants")}
                changed={status !== "unchanged"}
                before={
                  old ? (
                    <VariantContent
                      value={old}
                      category={before.profile.category}
                      taxonomy={taxonomy}
                      productImages={before.profile.images}
                    />
                  ) : (
                    t("revisionDiff.absent")
                  )
                }
                proposed={
                  next ? (
                    <VariantContent
                      value={next}
                      category={proposed.profile.category}
                      taxonomy={taxonomy}
                      productImages={proposed.profile.images}
                    />
                  ) : (
                    t("revisionDiff.absent")
                  )
                }
              />
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
}
function Difference({
  title,
  changed,
  before,
  proposed,
}: {
  title: string;
  changed: boolean;
  before: ReactNode;
  proposed: ReactNode;
}) {
  const t = useTranslations("catalogManagement");
  return (
    <section aria-label={title} className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{title}</h3>
        <Badge variant={changed ? "secondary" : "outline"}>
          {t(changed ? "revisionDiff.changed" : "revisionDiff.unchanged")}
        </Badge>
      </div>
      <dl className="grid min-w-0 gap-4 md:grid-cols-2">
        <div className="grid min-w-0 content-start gap-2">
          <dt className="text-sm font-medium text-muted-foreground">{t("before")}</dt>
          <dd className="min-w-0 whitespace-pre-wrap break-words">{before}</dd>
        </div>
        <div className="grid min-w-0 content-start gap-2">
          <dt className="text-sm font-medium text-muted-foreground">{t("proposed")}</dt>
          <dd className="min-w-0 whitespace-pre-wrap break-words">{proposed}</dd>
        </div>
      </dl>
    </section>
  );
}
function Images({ ids, name }: { ids: string[]; name: string }) {
  return <ProductGallery key={ids.join("/")} name={name} images={ids.map(catalogImageUrl)} />;
}
function Attributes({
  value,
  category,
  scope,
  taxonomy,
}: {
  value: Record<string, unknown>;
  category: string;
  scope: "product" | "variant";
  taxonomy: Taxonomy;
}) {
  const locale = useLocale(),
    t = useTranslations("catalogManagement.revisionDiff");
  if (!Object.keys(value).length) return <p>{t("empty")}</p>;
  return (
    <dl className="grid gap-2">
      {Object.entries(value).map(([code, item]) => {
        const definition = taxonomy.attributes.find(
          (row) => row.category === category && row.scope === scope && row.code === code,
        );
        const label = definition?.options.find((option) => option.code === item)?.label;
        return (
          <div key={code}>
            <dt className="text-sm text-muted-foreground">
              <bdi>{definition?.name ?? code}</bdi>
            </dt>
            <dd>
              <bdi>
                {label ?? attributeValueText(item, locale)}
                {definition?.unit ? ` ${definition.unit}` : ""}
              </bdi>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
function VariantContent({
  value,
  category,
  taxonomy,
  productImages,
}: {
  value: Revision["proposed"]["variants"][number];
  category: string;
  taxonomy: Taxonomy;
  productImages: string[];
}) {
  const t = useTranslations("catalogManagement"),
    catalog = useTranslations("catalog"),
    format = useFormatter();
  return (
    <div className="grid gap-4">
      <p>
        <bdi>{value.sku}</bdi>
      </p>
      <Attributes
        value={value.attributes}
        category={category}
        scope="variant"
        taxonomy={taxonomy}
      />
      <Images
        name={value.sku}
        ids={value.images.length ? value.images : productImages.slice(0, 1)}
      />
      {value.supply && (
        <section className="grid gap-2" aria-label={t("supply")}>
          <h4 className="font-medium">{t("supply")}</h4>
          <p>{catalog(`supply.${value.supply.mode}`)}</p>
          <dl className="grid gap-2">
            {(
              [
                ["ready_stock", "readyStock"],
                ["production_cap", "productionCapacity"],
                ["lead_time_days", "leadDays"],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <dt className="text-sm text-muted-foreground">{t(label)}</dt>
                <dd>{format.number(value.supply?.[key] ?? 0)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {value.package && (
        <section aria-label={t("shipping")} className="grid gap-2">
          <h4 className="font-medium">{t("shipping")}</h4>
          <VariantPackageDetails value={value.package} />
        </section>
      )}
    </div>
  );
}

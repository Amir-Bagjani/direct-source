"use client";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { readPublicManufacturer, readPublicProducts } from "../../api/public-catalog.api";
import {
  publicManufacturerOptions,
  publicProductsOptions,
} from "../../queries/public-catalog.queries";
import type { CatalogFilters } from "../../utils/catalog-search";
import { ProductCard } from "../product-card/product-card";
import { Card, CardContent, CardDescription, CardHeader } from "@/shared/ui/card/card";

export function ManufacturerProfile({ id, filters }: { id: string; filters: CatalogFilters }) {
  const t = useTranslations("catalog.manufacturer");
  const locale = useLocale();
  const { data: manufacturer } = useSuspenseQuery(
    publicManufacturerOptions(id, readPublicManufacturer),
  );
  const { data: products } = useSuspenseQuery(publicProductsOptions(filters, readPublicProducts));
  const location = [manufacturer.province, manufacturer.city]
    .filter(Boolean)
    .join(t("locationSeparator"));
  return (
    <div className="grid gap-8">
      <Card>
        <CardHeader>
          <h1 className="text-3xl font-semibold ltr:tracking-tight">{manufacturer.name}</h1>
          <CardDescription>{manufacturer.verified ? t("verified") : null}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="leading-7 text-muted-foreground">{manufacturer.description}</p>
          <dl className="grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-sm text-muted-foreground">{t("location")}</dt>
              <dd className="mt-1 font-medium">{location || t("locationUnavailable")}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{t("joined")}</dt>
              <dd className="mt-1 font-medium">
                {manufacturer.joined_at
                  ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
                      new Date(manufacturer.joined_at),
                    )
                  : t("unknown")}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{t("productsCount")}</dt>
              <dd className="mt-1 font-medium">
                {new Intl.NumberFormat(locale).format(manufacturer.product_count)}
              </dd>
            </div>
          </dl>
          {manufacturer.categories.length ? (
            <p className="text-sm text-muted-foreground">
              {t("categories", {
                categories: manufacturer.categories
                  .map((category) => category.name)
                  .join(t("categorySeparator")),
              })}
            </p>
          ) : null}
        </CardContent>
      </Card>
      <section aria-labelledby="manufacturer-products" className="grid gap-5">
        <h2 id="manufacturer-products" className="text-2xl font-semibold">
          {t("products")}
        </h2>
        {products.results.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {products.results.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">{t("noProducts")}</p>
        )}
      </section>
    </div>
  );
}

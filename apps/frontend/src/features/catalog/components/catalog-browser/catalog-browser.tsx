"use client";
import { environmentManager, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { readPublicProducts } from "../../api/public-catalog.api";
import { readWholesaleAccess, readWholesaleProducts } from "../../api/wholesale-catalog.api";
import { publicProductsOptions } from "../../queries/public-catalog.queries";
import {
  wholesaleAccessOptions,
  wholesaleProductsOptions,
} from "../../queries/wholesale-catalog.queries";
import { catalogPageHref, catalogSearch, type CatalogFilters } from "../../utils/catalog-search";
import { ProductCard } from "../product-card/product-card";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert/alert";
import { buttonVariants } from "@/shared/ui/button/button.variants";
import { Button } from "@/shared/ui/button/button";
import { Card, CardContent } from "@/shared/ui/card/card";
import { Field, FieldLabel } from "@/shared/ui/field/field";
import { Input } from "@/shared/ui/input/input";
import { NativeSelect, NativeSelectOption } from "@/shared/ui/native-select/native-select";
import { cn } from "@/shared/ui/cn";

export function CatalogBrowser({ filters }: { filters: CatalogFilters }) {
  const t = useTranslations("catalog");
  const { data: publicData } = useSuspenseQuery(publicProductsOptions(filters, readPublicProducts));
  const access = useQuery({
    ...wholesaleAccessOptions(readWholesaleAccess),
    enabled: !environmentManager.isServer(),
  });
  const scope = access.data?.allowed ? access.data.scope : "";
  const wholesale = useQuery({
    ...wholesaleProductsOptions(scope, filters, readWholesaleProducts),
    enabled: Boolean(scope),
  });
  const priceAllowed = Boolean(scope);
  const data = wholesale.isSuccess ? wholesale.data : publicData;
  const categories = [
    ...new Map(
      publicData.results
        .flatMap((product) => product.category_path)
        .map((category) => [category.id, category]),
    ).values(),
  ];
  const actionQuery = catalogSearch({ ...filters, page: 1 });

  return (
    <div className="grid gap-8">
      <Card>
        <CardContent>
          <form method="get" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="catalog-query">{t("filters.search")}</FieldLabel>
              <Input
                id="catalog-query"
                name="q"
                type="search"
                minLength={2}
                maxLength={200}
                defaultValue={filters.q}
                placeholder={t("filters.searchPlaceholder")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="catalog-supply">{t("filters.supply")}</FieldLabel>
              <NativeSelect
                id="catalog-supply"
                name="supply"
                defaultValue={filters.supply[0] ?? ""}
                className="w-full"
              >
                <NativeSelectOption value="">{t("filters.all")}</NativeSelectOption>
                <NativeSelectOption value="ready">{t("supply.ready")}</NativeSelectOption>
                <NativeSelectOption value="production">{t("supply.production")}</NativeSelectOption>
                <NativeSelectOption value="hybrid">{t("supply.hybrid")}</NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="catalog-method">{t("filters.method")}</FieldLabel>
              <NativeSelect
                id="catalog-method"
                name="method"
                defaultValue={filters.method[0] ?? ""}
                className="w-full"
              >
                <NativeSelectOption value="">{t("filters.all")}</NativeSelectOption>
                <NativeSelectOption value="free_mix">{t("method.free_mix")}</NativeSelectOption>
                <NativeSelectOption value="fixed_pack">{t("method.fixed_pack")}</NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="catalog-orderable">{t("filters.availability")}</FieldLabel>
              <NativeSelect
                id="catalog-orderable"
                name="orderable"
                defaultValue={filters.orderable}
                className="w-full"
              >
                <NativeSelectOption value="">{t("filters.all")}</NativeSelectOption>
                <NativeSelectOption value="true">{t("orderable")}</NativeSelectOption>
                <NativeSelectOption value="false">{t("notOrderable")}</NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="catalog-sort">{t("filters.sort")}</FieldLabel>
              <NativeSelect
                key={priceAllowed ? "wholesale-sort" : "public-sort"}
                id="catalog-sort"
                name="sort"
                defaultValue={
                  !priceAllowed && filters.sort.startsWith("price_") ? "" : filters.sort
                }
                className="w-full"
              >
                <NativeSelectOption value="">{t("sort.default")}</NativeSelectOption>
                <NativeSelectOption value="newest">{t("sort.newest")}</NativeSelectOption>
                <NativeSelectOption value="relevance">{t("sort.relevance")}</NativeSelectOption>
                <NativeSelectOption value="lead_time">{t("sort.leadTime")}</NativeSelectOption>
                <NativeSelectOption value="rating">{t("sort.rating")}</NativeSelectOption>
                {priceAllowed ? (
                  <>
                    <NativeSelectOption value="price_asc">{t("sort.priceAsc")}</NativeSelectOption>
                    <NativeSelectOption value="price_desc">
                      {t("sort.priceDesc")}
                    </NativeSelectOption>
                  </>
                ) : null}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="catalog-lead-min">{t("filters.leadMin")}</FieldLabel>
              <Input
                id="catalog-lead-min"
                name="lead_min"
                type="number"
                min={0}
                max={3650}
                defaultValue={filters.leadMin}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="catalog-lead-max">{t("filters.leadMax")}</FieldLabel>
              <Input
                id="catalog-lead-max"
                name="lead_max"
                type="number"
                min={0}
                max={3650}
                defaultValue={filters.leadMax}
              />
            </Field>
            {priceAllowed ? (
              <>
                <Field>
                  <FieldLabel htmlFor="catalog-price-min">{t("filters.priceMin")}</FieldLabel>
                  <Input
                    id="catalog-price-min"
                    name="price_min"
                    type="number"
                    min={0}
                    max={100_000_000_000_000}
                    defaultValue={filters.priceMin}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="catalog-price-max">{t("filters.priceMax")}</FieldLabel>
                  <Input
                    id="catalog-price-max"
                    name="price_max"
                    type="number"
                    min={0}
                    max={100_000_000_000_000}
                    defaultValue={filters.priceMax}
                  />
                </Field>
              </>
            ) : null}
            <div className="flex items-end gap-2">
              <Button type="submit">{t("filters.apply")}</Button>
              <Link href="/catalog" className={cn(buttonVariants({ variant: "outline" }))}>
                {t("filters.clear")}
              </Link>
            </div>
            {filters.categories.map((category) => (
              <input key={category} type="hidden" name="category" value={category} />
            ))}
            {filters.manufacturers.map((manufacturer) => (
              <input key={manufacturer} type="hidden" name="manufacturer" value={manufacturer} />
            ))}
          </form>
        </CardContent>
      </Card>

      {categories.length ? (
        <nav aria-label={t("categories")} className="flex flex-wrap gap-2">
          {categories.map((category) => {
            const query = new URLSearchParams(actionQuery);
            query.delete("category");
            query.append("category", category.id);
            return (
              <Link
                key={category.id}
                href={`/catalog?${query.toString()}`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                {category.name}
              </Link>
            );
          })}
        </nav>
      ) : null}

      <p className="text-sm text-muted-foreground">{t("resultCount", { count: data.count })}</p>
      {priceAllowed && wholesale.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t("wholesale.loading")}
        </p>
      ) : null}
      {priceAllowed && wholesale.isError ? (
        <Alert variant="destructive">
          <AlertTitle>{t("wholesale.unavailableTitle")}</AlertTitle>
          <AlertDescription>{t("wholesale.unavailableDescription")}</AlertDescription>
        </Alert>
      ) : null}
      {data.results.length ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {data.results.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              showWholesale={wholesale.isSuccess}
              {...("representative_price_irr" in product
                ? { representativePriceIrr: product.representative_price_irr }
                : {})}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="grid gap-4 py-8 text-center">
            <p className="font-medium">{t("empty.title")}</p>
            <p className="text-muted-foreground">{t("empty.description")}</p>
            <div>
              <Link href="/catalog" className={cn(buttonVariants({ variant: "outline" }))}>
                {t("filters.clear")}
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <nav aria-label={t("pagination")} className="flex justify-center gap-3">
        {data.previous ? (
          <Link
            href={catalogPageHref(filters, Math.max(1, filters.page - 1))}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            {t("previous")}
          </Link>
        ) : null}
        <span className="inline-flex min-h-8 items-center text-sm text-muted-foreground">
          {t("page", { page: filters.page })}
        </span>
        {data.next ? (
          <Link
            href={catalogPageHref(filters, filters.page + 1)}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            {t("next")}
          </Link>
        ) : null}
      </nav>
    </div>
  );
}

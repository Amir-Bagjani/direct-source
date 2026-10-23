"use client";
import { useEffect, useTransition, type SubmitEvent } from "react";
import { environmentManager, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { SearchIcon, SlidersHorizontalIcon, XIcon } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { readPublicDiscovery, readPublicProducts } from "../../api/public-catalog.api";
import { readWholesaleAccess, readWholesaleProducts } from "../../api/wholesale-catalog.api";
import {
  publicDiscoveryOptions,
  publicProductsOptions,
} from "../../queries/public-catalog.queries";
import {
  wholesaleAccessOptions,
  wholesaleProductsOptions,
} from "../../queries/wholesale-catalog.queries";
import {
  catalogPageHref,
  catalogSearch,
  publicCatalogFilters,
  type CatalogFilters,
} from "../../utils/catalog-search";
import { ProductCard } from "../product-card/product-card";
import { CatalogFiltersForm } from "../catalog-filters-form/catalog-filters-form";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert/alert";
import { buttonVariants } from "@/shared/ui/button/button.variants";
import { Button } from "@/shared/ui/button/button";
import { Field, FieldLabel } from "@/shared/ui/field/field";
import { Input } from "@/shared/ui/input/input";
import { NativeSelect, NativeSelectOption } from "@/shared/ui/native-select/native-select";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/shared/ui/empty/empty";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/shared/ui/sheet/sheet";
import { closeModal, openModal, prepareModalHistory } from "@/shared/ui/modal/modal-history";
import { Spinner } from "@/shared/ui/spinner/spinner";
import { cn } from "@/shared/ui/cn";

export function CatalogBrowser({ filters }: { filters: CatalogFilters }) {
  const t = useTranslations("catalog");
  const common = useTranslations("common");
  const format = useFormatter();
  const router = useRouter();
  const params = useSearchParams();
  const sheetOpen = params.get("modal") === "catalog-filters";
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    if (sheetOpen) prepareModalHistory();
  }, [sheetOpen]);
  const { data: publicData } = useSuspenseQuery(publicProductsOptions(filters, readPublicProducts));
  const { data: discovery } = useSuspenseQuery(publicDiscoveryOptions(readPublicDiscovery));
  const access = useQuery({
    ...wholesaleAccessOptions(readWholesaleAccess),
    enabled: !environmentManager.isServer(),
  });
  const scope = access.isSuccess && access.data.allowed ? access.data.scope : "";
  const wholesale = useQuery({
    ...wholesaleProductsOptions(scope, filters, readWholesaleProducts),
    enabled: Boolean(scope),
  });
  const priceAllowed = Boolean(scope);
  // A stale private result must never outlive its current access decision.
  const showWholesale = priceAllowed && wholesale.isSuccess;
  const data = showWholesale ? wholesale.data : publicData;
  const pricePending = access.isPending || (priceAllowed && wholesale.isPending);
  const activeFilters = priceAllowed ? filters : publicCatalogFilters(filters);
  const query = catalogSearch({ ...activeFilters, page: 1 });
  const filterEntries = [...query.entries()].filter(([name]) => name !== "q" && name !== "sort");
  const categories = discovery.categories;

  function navigate(search: URLSearchParams, replace = false) {
    search.delete("page");
    startTransition(() => {
      const href = `/catalog${search.size ? `?${search.toString()}` : ""}`;
      if (replace) router.replace(href);
      else router.push(href);
    });
  }
  function submitFilters(event: SubmitEvent<HTMLFormElement>, replace = false) {
    event.preventDefault();
    const search = new URLSearchParams();
    for (const [name, value] of new FormData(event.currentTarget)) {
      if (typeof value === "string" && value.trim()) search.append(name, value.trim());
    }
    navigate(search, replace);
  }
  function withoutFilter(name: string, value: string) {
    const search = new URLSearchParams(query);
    const remaining = search.getAll(name).filter((entry) => entry !== value);
    search.delete(name);
    for (const entry of remaining) search.append(name, entry);
    return `/catalog${search.size ? `?${search.toString()}` : ""}`;
  }
  function filterLabel(name: string, value: string) {
    if (name === "supply") return t(`supply.${value}`);
    if (name === "method") return t(`method.${value}`);
    if (name === "orderable") return value === "true" ? t("orderable") : t("notOrderable");
    if (name === "category")
      return (
        categories
          .find((category) => category.id === value)
          ?.path.map((category) => category.name)
          .join(t("filters.categoryPathSeparator")) ?? t("filters.selectedCategory")
      );
    if (name === "manufacturer")
      return (
        discovery.manufacturers.find((manufacturer) => manufacturer.id === value)?.name ??
        t("filters.selectedManufacturer")
      );
    if (name === "rating_min")
      return t("filters.summaryRating", { count: format.number(Number(value)) });
    if (name.startsWith("attr.")) {
      const attribute = discovery.attributes.find((item) => item.id === name.slice(5));
      return `${attribute?.name ?? t("filters.attributeValues")}: ${attribute?.options.find((option) => option.code === value)?.label ?? value}`;
    }
    if (name === "lead_min")
      return t("filters.summaryLeadMin", { count: format.number(Number(value)) });
    if (name === "lead_max")
      return t("filters.summaryLeadMax", { count: format.number(Number(value)) });
    return t(name === "price_min" ? "filters.summaryPriceMin" : "filters.summaryPriceMax", {
      amount: format.number(Number(value)),
    });
  }
  const clearLink = (
    <Link href="/catalog" className={cn(buttonVariants({ variant: "outline" }))}>
      {t("filters.clear")}
    </Link>
  );
  const applyButton = (
    <Button type="submit" disabled={pending}>
      {t("filters.apply")}
    </Button>
  );

  return (
    <div className="grid min-w-0 gap-5 sm:gap-6">
      <form
        key={filters.q}
        method="get"
        onSubmit={(event) => {
          event.preventDefault();
          const search = new URLSearchParams(query);
          search.delete("q");
          const value = new FormData(event.currentTarget).get("q");
          if (typeof value === "string" && value.trim()) search.set("q", value.trim());
          navigate(search);
        }}
        className="flex items-end gap-2 lg:max-w-2xl"
      >
        <Field className="min-w-0 flex-1">
          <FieldLabel htmlFor="catalog-query" className="sr-only">
            {t("filters.search")}
          </FieldLabel>
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
        <Button type="submit" disabled={pending}>
          <SearchIcon aria-hidden="true" />
          {t("filters.search")}
        </Button>
      </form>

      {!priceAllowed && !pricePending ? (
        <Alert>
          <AlertTitle>{t("priceProtected")}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link
              href="/account"
              className={cn(buttonVariants({ variant: "link" }), "whitespace-normal px-0")}
            >
              {t("completeBusiness")}
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid min-w-0 gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8">
        <aside className="hidden min-w-0 lg:block" aria-labelledby="catalog-filters-title">
          <div className="grid gap-5 pe-6">
            <h2 id="catalog-filters-title" className="text-lg font-semibold">
              {t("filters.title")}
            </h2>
            <CatalogFiltersForm
              filters={activeFilters}
              discovery={discovery}
              priceAllowed={priceAllowed}
              id="catalog-desktop-filters"
              onSubmit={(event) => submitFilters(event)}
              footer={
                <div className="flex flex-wrap gap-2">
                  {applyButton}
                  {clearLink}
                </div>
              }
            />
          </div>
        </aside>

        <section
          aria-label={t("title")}
          className="grid min-w-0 content-start gap-4"
          aria-busy={pending}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground" role="status">
              {t("resultCount", { count: data.count })}
            </p>
            <div className="flex w-full items-center justify-between gap-3 sm:w-auto">
              <Sheet
                open={sheetOpen}
                onOpenChange={(open) => {
                  if (open) openModal("catalog-filters");
                  else closeModal();
                }}
              >
                <SheetTrigger render={<Button variant="outline" className="lg:hidden" />}>
                  <SlidersHorizontalIcon aria-hidden="true" />
                  {t("filters.title")}
                  {filterEntries.length ? (
                    <span>({format.number(filterEntries.length)})</span>
                  ) : null}
                </SheetTrigger>
                <SheetContent
                  side="bottom"
                  showCloseButton={false}
                  className="data-[side=bottom]:h-dvh max-h-dvh gap-0"
                >
                  <SheetHeader className="flex-row items-start justify-between gap-3">
                    <div className="grid gap-1">
                      <SheetTitle>{t("filters.title")}</SheetTitle>
                      <SheetDescription>{t("filters.sheetDescription")}</SheetDescription>
                    </div>
                    <Button variant="outline" onClick={closeModal}>
                      {common("close")}
                    </Button>
                  </SheetHeader>
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6">
                    <CatalogFiltersForm
                      filters={activeFilters}
                      discovery={discovery}
                      priceAllowed={priceAllowed}
                      id="catalog-mobile-filters"
                      onSubmit={(event) => submitFilters(event, true)}
                      footer={null}
                    />
                  </div>
                  <SheetFooter className="flex-row border-t pb-[max(1rem,env(safe-area-inset-bottom))]">
                    {clearLink}
                    <Button
                      type="submit"
                      form="catalog-mobile-filters"
                      disabled={pending}
                      className="flex-1"
                    >
                      {t("filters.apply")}
                    </Button>
                  </SheetFooter>
                </SheetContent>
              </Sheet>
              <Field className="w-auto min-w-0">
                <FieldLabel htmlFor="catalog-sort" className="sr-only">
                  {t("filters.sort")}
                </FieldLabel>
                <NativeSelect
                  key={`${priceAllowed}-${filters.sort}`}
                  id="catalog-sort"
                  name="sort"
                  defaultValue={activeFilters.sort}
                  className="w-full max-w-52 [&_select]:min-h-11"
                  onChange={(event) => {
                    const search = new URLSearchParams(query);
                    search.delete("sort");
                    if (event.target.value) search.set("sort", event.target.value);
                    navigate(search);
                  }}
                >
                  <NativeSelectOption value="">
                    {filters.q ? t("sort.relevance") : t("sort.newest")}
                  </NativeSelectOption>
                  <NativeSelectOption value="newest">{t("sort.newest")}</NativeSelectOption>
                  <NativeSelectOption value="relevance">{t("sort.relevance")}</NativeSelectOption>
                  <NativeSelectOption value="lead_time">{t("sort.leadTime")}</NativeSelectOption>
                  <NativeSelectOption value="rating">{t("sort.rating")}</NativeSelectOption>
                  {priceAllowed ? (
                    <>
                      <NativeSelectOption value="price_asc">
                        {t("sort.priceAsc")}
                      </NativeSelectOption>
                      <NativeSelectOption value="price_desc">
                        {t("sort.priceDesc")}
                      </NativeSelectOption>
                    </>
                  ) : null}
                </NativeSelect>
              </Field>
            </div>
          </div>

          {filterEntries.length ? (
            <nav aria-label={t("filters.active")} className="flex flex-wrap gap-2">
              {filterEntries.map(([name, value]) => (
                <Link
                  key={`${name}-${value}`}
                  href={withoutFilter(name, value)}
                  aria-label={t("filters.remove", { filter: filterLabel(name, value) })}
                  className={cn(
                    buttonVariants({ variant: "outline" }),
                    "max-w-full whitespace-normal text-start",
                  )}
                >
                  <bdi>{filterLabel(name, value)}</bdi>
                  <XIcon aria-hidden="true" />
                </Link>
              ))}
              {clearLink}
            </nav>
          ) : null}
          {pending || pricePending ? (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner aria-hidden="true" />
              {pending ? t("filters.updating") : t("wholesale.loading")}
            </p>
          ) : null}
          {priceAllowed && wholesale.isError ? (
            <Alert variant="destructive">
              <AlertTitle>{t("wholesale.unavailableTitle")}</AlertTitle>
              <AlertDescription>
                {t("wholesale.unavailableDescription")}
                <Button
                  variant="outline"
                  onClick={() => {
                    void wholesale.refetch();
                  }}
                >
                  {common("retry")}
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          {data.results.length ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 sm:gap-5">
              {data.results.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  showWholesale={priceAllowed}
                  pricePending={pricePending}
                  {...("representative_price_irr" in product
                    ? { representativePriceIrr: product.representative_price_irr }
                    : {})}
                />
              ))}
            </div>
          ) : (
            <Empty className="py-12">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchIcon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>{t("empty.title")}</EmptyTitle>
                <EmptyDescription>{t("empty.description")}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>{clearLink}</EmptyContent>
            </Empty>
          )}
          <nav
            aria-label={t("pagination")}
            className="flex flex-wrap items-center justify-center gap-3 pt-2"
          >
            {data.previous ? (
              <Link
                href={catalogPageHref(activeFilters, Math.max(1, filters.page - 1))}
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                {t("previous")}
              </Link>
            ) : null}
            <span className="inline-flex min-h-11 items-center text-sm text-muted-foreground">
              {t("page", { page: filters.page })}
            </span>
            {data.next ? (
              <Link
                href={catalogPageHref(activeFilters, filters.page + 1)}
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                {t("next")}
              </Link>
            ) : null}
          </nav>
        </section>
      </div>
    </div>
  );
}

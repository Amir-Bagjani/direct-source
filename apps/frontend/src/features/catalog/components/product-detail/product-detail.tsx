"use client";
import { useId } from "react";
import { environmentManager, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { readPublicProduct } from "../../api/public-catalog.api";
import { readWholesaleAccess, readWholesaleProduct } from "../../api/wholesale-catalog.api";
import { publicProductOptions } from "../../queries/public-catalog.queries";
import {
  wholesaleAccessOptions,
  wholesaleProductOptions,
} from "../../queries/wholesale-catalog.queries";
import type { WholesaleProduct } from "../../schemas/public-catalog.schema";
import { attributeValueText } from "../../utils/attribute-value-text";
import { formatToman } from "../../utils/money";
import { PriceTable } from "../price-table/price-table";
import { SelectionPreview } from "../selection-preview/selection-preview";
import { quoteWholesaleProduct } from "../../api/catalog-quote.api";
import { ProductGallery } from "../product-gallery/product-gallery";
import { ProductReviews } from "../product-reviews/product-reviews";
import { Badge } from "@/shared/ui/badge/badge";
import { Modal } from "@/shared/ui/modal/modal";
import { openModal } from "@/shared/ui/modal/modal-history";
import { DialogTitle, DialogDescription } from "@/shared/ui/dialog/dialog";
import { ProductImage } from "../product-image/product-image";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert/alert";
import { buttonVariants } from "@/shared/ui/button/button.variants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card/card";
import { Button } from "@/shared/ui/button/button";
import { Separator } from "@/shared/ui/separator/separator";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table/table";
import { cn } from "@/shared/ui/cn";

function WholesalePrices({ product }: { product: WholesaleProduct }) {
  const t = useTranslations("catalog");
  const locale = useLocale();
  const plan = product.wholesale;
  if (!plan)
    return (
      <Alert>
        <AlertTitle>{t("priceUnavailable")}</AlertTitle>
        <AlertDescription>{t("wholesale.noPlan")}</AlertDescription>
      </Alert>
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("wholesale.title")}</h2>
        </CardTitle>
        <CardDescription>
          {product.representative_price_irr === null
            ? t("priceUnavailable")
            : t("priceFrom", {
                amount: formatToman(product.representative_price_irr, locale),
              })}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <PriceTable
          tiers={plan.tiers}
          variants={product.variants}
          caption={t("wholesale.caption")}
        />
        {plan.free_mix_min ? (
          <p className="text-sm text-muted-foreground">
            {t("wholesale.freeMixMinimum", { count: plan.free_mix_min })}
          </p>
        ) : null}
        {plan.packs.length ? (
          <div className="grid gap-2">
            <p className="font-medium">{t("wholesale.packs")}</p>
            <ul className="grid gap-2 text-sm text-muted-foreground">
              {plan.packs.map((pack) => (
                <li key={pack.code} className="rounded-lg border p-3">
                  {pack.name} ·{" "}
                  {t("wholesale.packUnits", {
                    count: pack.items.reduce((total, item) => total + item.quantity, 0),
                  })}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ProductDetail({ id }: { id: string }) {
  const t = useTranslations("catalog");
  const locale = useLocale();
  const { data: product } = useSuspenseQuery(publicProductOptions(id, readPublicProduct));
  const format = useFormatter();
  const params = useSearchParams();
  const galleryVariant = product.variants.find((variant) => variant.id === params.get("id"));
  const galleryTitle = useId();
  const common = useTranslations("common");
  const access = useQuery({
    ...wholesaleAccessOptions(readWholesaleAccess),
    enabled: !environmentManager.isServer(),
  });
  const scope = access.isSuccess && access.data.allowed ? access.data.scope : "";
  const wholesale = useQuery({
    ...wholesaleProductOptions(scope, id, readWholesaleProduct),
    enabled: Boolean(scope),
  });
  const location = [product.manufacturer.province, product.manufacturer.city]
    .filter(Boolean)
    .join(t("locationSeparator"));

  return (
    <article className="grid gap-8">
      <nav
        aria-label={t("breadcrumb")}
        className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
      >
        <Link href="/catalog" className="hover:underline">
          {t("title")}
        </Link>
        {product.category_path.map((category) => (
          <span key={category.id} className="flex items-center gap-2">
            <span aria-hidden="true">/</span>
            <Link href={`/catalog?category=${category.id}`} className="hover:underline">
              {category.name}
            </Link>
          </span>
        ))}
      </nav>

      <header className="grid gap-2">
        <p className="text-sm text-muted-foreground">{product.brand || t("brandUnavailable")}</p>
        <h1 className="text-3xl font-semibold ltr:tracking-tight">
          <bdi>{product.name}</bdi>
        </h1>
      </header>
      <div className="grid gap-8 lg:grid-cols-2">
        <ProductGallery
          key={product.image_urls.join("\n")}
          name={product.name}
          images={product.image_urls}
        />
        <div className="grid content-start gap-5">
          <p className="leading-7 text-muted-foreground">{product.description}</p>
          <p className="text-sm text-muted-foreground">
            {product.rating.average !== null && product.rating.count > 0
              ? t("card.rating", {
                  average: format.number(product.rating.average, { maximumFractionDigits: 1 }),
                  count: format.number(product.rating.count),
                })
              : t("card.noRating")}
          </p>
          <Card>
            <CardHeader>
              <CardTitle>{t("manufacturer.title")}</CardTitle>
              {product.manufacturer.verified && (
                <Badge variant="outline">{t("manufacturer.verified")}</Badge>
              )}
              <CardDescription>{location || t("manufacturer.locationUnavailable")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {product.manufacturer.logo_url && (
                <ProductImage
                  src={product.manufacturer.logo_url}
                  alt={product.manufacturer.name}
                  fallback={product.manufacturer.name}
                  className="size-16"
                  sizes="64px"
                  fit="contain"
                />
              )}
              <Link
                href={`/manufacturers/${product.manufacturer.id}`}
                className="font-medium hover:underline"
              >
                {product.manufacturer.name}
              </Link>
              <p className="text-sm text-muted-foreground">{product.manufacturer.description}</p>
            </CardContent>
          </Card>
          {scope && wholesale.isSuccess ? (
            <WholesalePrices product={wholesale.data} />
          ) : scope ? (
            wholesale.isError ? (
              <Alert variant="destructive">
                <AlertTitle>{t("wholesale.unavailableTitle")}</AlertTitle>
                <AlertDescription>
                  {t("wholesale.unavailableDescription")}
                  <Button variant="outline" onClick={() => void wholesale.refetch()}>
                    {common("retry")}
                  </Button>
                </AlertDescription>
              </Alert>
            ) : (
              <p role="status" className="text-sm text-muted-foreground">
                {t("wholesale.loading")}
              </p>
            )
          ) : access.isPending ? (
            <p role="status" className="text-sm text-muted-foreground">
              {t("wholesale.loading")}
            </p>
          ) : (
            <>
              <Alert>
                <AlertTitle>{t("priceProtected")}</AlertTitle>
                <AlertDescription>{t("priceProtectedDescription")}</AlertDescription>
              </Alert>
              <div className="flex flex-wrap gap-3">
                <Link href="/register" className={cn(buttonVariants())}>
                  {t("createAccount")}
                </Link>
                <Link href="/account" className={cn(buttonVariants({ variant: "outline" }))}>
                  {t("completeBusiness")}
                </Link>
              </div>
            </>
          )}
        </div>
      </div>

      <Separator />
      <section aria-labelledby="product-specifications" className="grid gap-4">
        <h2 id="product-specifications" className="text-2xl font-semibold">
          {t("specifications")}
        </h2>
        {!product.display_attributes.length && !product.manufacturer_model && (
          <p className="text-muted-foreground">{t("specificationsUnavailable")}</p>
        )}
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {product.display_attributes.map(({ code, name, value, unit }) => (
            <div key={code} className="rounded-lg border p-4">
              <dt className="text-sm text-muted-foreground">
                <bdi>{name}</bdi>
              </dt>
              <dd className="mt-1 font-medium">
                <bdi>
                  {attributeValueText(value, locale)}
                  {unit ? ` ${unit}` : ""}
                </bdi>
              </dd>
            </div>
          ))}
          {product.manufacturer_model ? (
            <div className="rounded-lg border p-4">
              <dt className="text-sm text-muted-foreground">{t("model")}</dt>
              <dd className="mt-1 font-medium">{product.manufacturer_model}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section aria-labelledby="product-variants" className="grid gap-4">
        <div>
          <h2 id="product-variants" className="text-2xl font-semibold">
            {t("variants.title")}
          </h2>
          <p className="mt-1 text-muted-foreground">{t("variants.description")}</p>
        </div>
        <Table>
          <TableCaption className="sr-only">{t("variants.comparisonCaption")}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>{t("variants.image")}</TableHead>
              <TableHead>{t("variants.sku")}</TableHead>
              <TableHead>{t("specifications")}</TableHead>
              <TableHead>{t("variants.readyHeading")}</TableHead>
              <TableHead>{t("variants.productionHeading")}</TableHead>
              <TableHead>{t("card.preparation")}</TableHead>
              <TableHead>{t("filters.availability")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {product.variants.map((variant) => (
              <TableRow key={variant.id}>
                <TableCell>
                  {variant.image_urls[0] ? (
                    <Button
                      variant="outline"
                      className="size-16 p-1"
                      aria-label={t("variants.viewImages", { sku: variant.sku })}
                      onClick={() => openModal("variant-gallery", variant.id)}
                    >
                      <ProductImage
                        src={variant.image_urls[0]}
                        alt=""
                        fallback=""
                        className="size-full"
                        sizes="64px"
                      />
                    </Button>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>
                  <bdi>{variant.sku}</bdi>
                </TableCell>
                <TableCell>
                  <dl className="grid gap-2">
                    {variant.display_attributes.map((attribute) => (
                      <div key={attribute.code} className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">
                          <bdi>{attribute.name}</bdi>
                        </dt>
                        <dd>
                          <bdi>
                            {attributeValueText(attribute.value, locale)}
                            {attribute.unit ? ` ${attribute.unit}` : ""}
                          </bdi>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </TableCell>
                <TableCell>
                  {variant.supply
                    ? format.number(variant.supply.ready_stock)
                    : t("variants.noSupply")}
                </TableCell>
                <TableCell>
                  {variant.supply
                    ? format.number(variant.supply.production_cap)
                    : t("variants.noSupply")}
                </TableCell>
                <TableCell>
                  {variant.supply ? (
                    <div className="grid gap-1">
                      <p>{t(`supply.${variant.supply.mode}`)}</p>
                      {variant.supply.ready_stock > 0 && <p>{t("readyNow")}</p>}
                      {variant.supply.production_cap > 0 && (
                        <p>
                          {t("variants.productionDays", {
                            count: format.number(variant.supply.lead_time_days),
                          })}
                        </p>
                      )}
                    </div>
                  ) : (
                    t("variants.noSupply")
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={variant.orderable ? "secondary" : "outline"}>
                    {variant.orderable ? t("orderable") : t("notOrderable")}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p aria-hidden="true" className="text-sm text-muted-foreground">
          {t("variants.comparisonCaption")}
        </p>
        {!product.variants.length && <p className="text-muted-foreground">{t("variants.empty")}</p>}
        <p className="text-sm text-muted-foreground">{t("variants.preparationHint")}</p>
        <Modal name="variant-gallery" labelledBy={galleryTitle}>
          <DialogTitle id={galleryTitle}>{galleryVariant?.sku ?? t("variants.image")}</DialogTitle>
          <DialogDescription>{t("variants.galleryDescription")}</DialogDescription>
          {galleryVariant ? (
            <ProductGallery
              key={galleryVariant.image_urls.join("\n")}
              name={galleryVariant.sku}
              images={galleryVariant.image_urls}
            />
          ) : (
            <p>{t("variants.galleryUnavailable")}</p>
          )}
        </Modal>
      </section>

      {scope && wholesale.isSuccess && wholesale.data.wholesale && (
        <SelectionPreview
          key={`${scope}:${id}`}
          scope={scope}
          productId={id}
          plan={wholesale.data.wholesale}
          variants={wholesale.data.variants}
          quote={quoteWholesaleProduct}
        />
      )}

      <section aria-labelledby="product-shipping" className="grid gap-4">
        <h2 id="product-shipping" className="text-2xl font-semibold">
          {t("shipping.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("shipping.costHint")}</p>
        {product.shipping_services.length ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {product.shipping_services.map((service) => (
              <li key={service.id} className="rounded-lg border p-4">
                <p className="font-medium">
                  <bdi>{service.name}</bdi>
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("shipping.deliveryRange", {
                    min: format.number(service.delivery_days_min),
                    max: format.number(service.delivery_days_max),
                  })}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">{t("shipping.unavailable")}</p>
        )}
      </section>
      <ProductReviews key={id} id={id} />
    </article>
  );
}

"use client";
import { environmentManager, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { readPublicProduct } from "../../api/public-catalog.api";
import { readWholesaleAccess, readWholesaleProduct } from "../../api/wholesale-catalog.api";
import { publicProductOptions } from "../../queries/public-catalog.queries";
import {
  wholesaleAccessOptions,
  wholesaleProductOptions,
} from "../../queries/wholesale-catalog.queries";
import type { WholesaleProduct } from "../../schemas/public-catalog.schema";
import { formatToman } from "../../utils/money";
import { ProductImage } from "../product-image/product-image";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert/alert";
import { buttonVariants } from "@/shared/ui/button/button.variants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card/card";
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

function valueText(value: unknown, locale: string): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return new Intl.NumberFormat(locale).format(value);
  if (typeof value === "boolean") return value ? "✓" : "—";
  if (Array.isArray(value)) return value.map((item) => valueText(item, locale)).join("، ");
  return value && typeof value === "object" ? JSON.stringify(value) : "—";
}

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
        <Table>
          <TableCaption>{t("wholesale.caption")}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>{t("wholesale.quantity")}</TableHead>
              <TableHead>{t("wholesale.defaultPrice")}</TableHead>
              {product.variants.map((variant) => (
                <TableHead key={variant.id}>{variant.sku}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {plan.tiers.map((tier) => (
              <TableRow key={tier.min_quantity}>
                <TableCell>
                  {tier.max_quantity === null
                    ? t("wholesale.openRange", { min: tier.min_quantity })
                    : t("wholesale.closedRange", {
                        min: tier.min_quantity,
                        max: tier.max_quantity,
                      })}
                </TableCell>
                <TableCell>
                  {t("tomanAmount", { amount: formatToman(tier.unit_price_irr, locale) })}
                </TableCell>
                {product.variants.map((variant) => {
                  const cell = tier.effective_prices.find((price) => price.variant === variant.id);
                  return (
                    <TableCell key={variant.id}>
                      {cell
                        ? t("tomanAmount", { amount: formatToman(cell.unit_price_irr, locale) })
                        : t("priceUnavailable")}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
  const access = useQuery({
    ...wholesaleAccessOptions(readWholesaleAccess),
    enabled: !environmentManager.isServer(),
  });
  const scope = access.data?.allowed ? access.data.scope : "";
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

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="grid grid-cols-2 gap-3">
          {(product.image_urls.length ? product.image_urls : [undefined]).map((image, index) => (
            <ProductImage
              key={image ?? "fallback"}
              src={image}
              alt={`${product.name} ${index + 1}`}
              fallback={t("imageFallback")}
            />
          ))}
        </div>
        <div className="grid content-start gap-5">
          <div>
            <p className="text-sm text-muted-foreground">
              {product.brand || t("brandUnavailable")}
            </p>
            <h1 className="mt-2 text-3xl font-semibold ltr:tracking-tight">{product.name}</h1>
          </div>
          <p className="leading-7 text-muted-foreground">{product.description}</p>
          <Card>
            <CardHeader>
              <CardTitle>{t("manufacturer.title")}</CardTitle>
              <CardDescription>{location || t("manufacturer.locationUnavailable")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Link
                href={`/manufacturers/${product.manufacturer.id}`}
                className="font-medium hover:underline"
              >
                {product.manufacturer.name}
              </Link>
              <p className="text-sm text-muted-foreground">{product.manufacturer.description}</p>
            </CardContent>
          </Card>
          {wholesale.isSuccess ? (
            <WholesalePrices product={wholesale.data} />
          ) : scope ? (
            wholesale.isError ? (
              <Alert variant="destructive">
                <AlertTitle>{t("wholesale.unavailableTitle")}</AlertTitle>
                <AlertDescription>{t("wholesale.unavailableDescription")}</AlertDescription>
              </Alert>
            ) : (
              <p role="status" className="text-sm text-muted-foreground">
                {t("wholesale.loading")}
              </p>
            )
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
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(product.attributes).map(([key, value]) => (
            <div key={key} className="rounded-lg border p-4">
              <dt className="text-sm text-muted-foreground">{key}</dt>
              <dd className="mt-1 font-medium">{valueText(value, locale)}</dd>
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
        <div className="grid gap-4 md:grid-cols-2">
          {product.variants.map((variant) => (
            <Card key={variant.id}>
              <CardHeader>
                <CardTitle>{variant.sku}</CardTitle>
                <CardDescription>
                  {variant.orderable ? t("orderable") : t("notOrderable")}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <dl className="grid gap-2">
                  {Object.entries(variant.attributes).map(([key, value]) => (
                    <div key={key} className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">{key}</dt>
                      <dd>{valueText(value, locale)}</dd>
                    </div>
                  ))}
                </dl>
                {variant.supply ? (
                  <div className="grid gap-1 border-t pt-3 text-sm text-muted-foreground">
                    <p>{t(`supply.${variant.supply.mode}`)}</p>
                    <p>{t("variants.readyStock", { count: variant.supply.ready_stock })}</p>
                    <p>{t("variants.productionCap", { count: variant.supply.production_cap })}</p>
                    <p>{t("leadDays", { count: variant.supply.lead_time_days })}</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("variants.noSupply")}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="product-shipping" className="grid gap-4">
        <h2 id="product-shipping" className="text-2xl font-semibold">
          {t("shipping.title")}
        </h2>
        {product.shipping_services.length ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {product.shipping_services.map((service) => (
              <li key={service.id} className="rounded-lg border p-4">
                {service.name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">{t("shipping.unavailable")}</p>
        )}
      </section>
    </article>
  );
}

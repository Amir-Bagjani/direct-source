"use client";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { BadgeCheckIcon, ImageOffIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardFooter, CardHeader } from "@/shared/ui/card/card";
import { Badge } from "@/shared/ui/badge/badge";
import { Skeleton } from "@/shared/ui/skeleton/skeleton";
import { buttonVariants } from "@/shared/ui/button/button.variants";
import { cn } from "@/shared/ui/cn";
import type { PublicProduct } from "../../schemas/public-catalog.schema";
import { formatToman } from "../../utils/money";
import { ProductImage } from "../product-image/product-image";

export function ProductCard({
  product,
  showWholesale = false,
  pricePending = false,
  representativePriceIrr,
}: {
  product: PublicProduct;
  showWholesale?: boolean;
  pricePending?: boolean;
  representativePriceIrr?: number | null;
}) {
  const t = useTranslations("catalog");
  const locale = useLocale();
  const format = useFormatter();
  const category = product.category_path.at(-1)?.name;
  const preparation =
    product.lead_time_days === 0
      ? t("readyNow")
      : product.lead_time_days === null
        ? t("leadUnavailable")
        : t("leadDays", { count: format.number(product.lead_time_days) });
  const facts = [
    {
      label: t("filters.supply"),
      value:
        product.supply_modes.map((mode) => t(`supply.${mode}`)).join(t("card.separator")) ||
        t("card.inDetails"),
    },
    {
      label: t("filters.method"),
      value:
        product.sale_methods.map((method) => t(`method.${method}`)).join(t("card.separator")) ||
        t("card.inDetails"),
    },
    {
      label: t("card.minimum"),
      value:
        product.minimum_order === null
          ? t("card.inDetails")
          : t("card.units", { count: format.number(product.minimum_order) }),
    },
    { label: t("card.preparation"), value: preparation },
  ];
  return (
    <Card className="grid h-full grid-cols-[5.5rem_minmax(0,1fr)] gap-0 py-0 sm:flex sm:flex-col">
      <Link
        href={`/catalog/${product.id}`}
        aria-label={product.name}
        className="m-3 self-start sm:m-0 sm:self-auto"
      >
        {product.image_urls[0] ? (
          <ProductImage
            src={product.image_urls[0]}
            alt={product.name}
            fallback={t("imageFallback")}
            className="sm:aspect-[4/3]"
            sizes="(min-width: 1280px) 300px, (min-width: 640px) 40vw, 64px"
          />
        ) : (
          <div className="flex aspect-square items-center justify-center bg-muted sm:aspect-[4/3]">
            <div className="grid justify-items-center gap-2 p-2 text-center text-xs text-muted-foreground sm:p-6 sm:text-sm">
              <ImageOffIcon aria-hidden="true" className="size-6" />
              <span className="sr-only sm:not-sr-only">{t("imageFallback")}</span>
            </div>
          </div>
        )}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <CardHeader className="gap-2 px-3 pt-3 sm:px-4 sm:pt-4">
          {category ? (
            <p className="text-xs text-muted-foreground">
              <bdi className="[font-family:Inter,Vazirmatn,sans-serif]">{category}</bdi>
            </p>
          ) : null}
          <h2 className="text-base font-semibold leading-snug sm:text-lg">
            <Link
              href={`/catalog/${product.id}`}
              className="inline-flex min-h-11 items-center hover:underline"
            >
              <bdi className="[font-family:Inter,Vazirmatn,sans-serif]">{product.name}</bdi>
            </Link>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/manufacturers/${product.manufacturer.id}`}
              className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:underline"
            >
              <bdi className="[font-family:Inter,Vazirmatn,sans-serif]">
                {product.manufacturer.name}
              </bdi>
            </Link>
            {product.manufacturer.verified ? (
              <Badge variant="outline">
                <BadgeCheckIcon aria-hidden="true" />
                {t("card.verified")}
              </Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 px-3 py-3 sm:px-4">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
            {facts.map(({ label, value }) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="grid gap-2">
            <p className="text-xs text-muted-foreground">
              {product.rating.average !== null && product.rating.count > 0
                ? t("card.rating", {
                    average: format.number(product.rating.average, { maximumFractionDigits: 1 }),
                    count: format.number(product.rating.count),
                  })
                : t("card.noRating")}
            </p>
            <Badge variant="secondary" className="h-auto whitespace-normal">
              {product.orderable ? t("orderable") : t("notOrderable")}
            </Badge>
          </div>
        </CardContent>
        <CardFooter className="mt-auto flex-col items-stretch gap-3 px-3 sm:px-4">
          {pricePending ? (
            <div role="status" aria-label={t("wholesale.loading")}>
              <Skeleton className="h-5 w-3/4" />
            </div>
          ) : showWholesale ? (
            <div className="grid gap-1">
              <p className="font-semibold">
                {representativePriceIrr === null || representativePriceIrr === undefined
                  ? t("priceUnavailable")
                  : t("priceFrom", { amount: formatToman(representativePriceIrr, locale) })}
              </p>
              {representativePriceIrr !== null && representativePriceIrr !== undefined ? (
                <p className="text-xs text-muted-foreground">{t("card.unitPrice")}</p>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t("priceProtected")}</p>
          )}
          <Link
            href={`/catalog/${product.id}`}
            className={cn(buttonVariants({ variant: "outline" }), "w-full")}
          >
            {t("card.view")}
          </Link>
        </CardFooter>
      </div>
    </Card>
  );
}

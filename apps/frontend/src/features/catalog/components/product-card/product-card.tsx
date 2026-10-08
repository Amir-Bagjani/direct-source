"use client";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card/card";
import type { PublicProduct } from "../../schemas/public-catalog.schema";
import { formatToman } from "../../utils/money";
import { ProductImage } from "../product-image/product-image";

export function ProductCard({
  product,
  showWholesale = false,
  representativePriceIrr,
}: {
  product: PublicProduct;
  showWholesale?: boolean;
  representativePriceIrr?: number | null;
}) {
  const t = useTranslations("catalog");
  const locale = useLocale();
  const category = product.category_path.at(-1)?.name;
  return (
    <Card className="h-full">
      <Link href={`/catalog/${product.id}`} aria-label={product.name}>
        <ProductImage
          src={product.image_urls[0]}
          alt={product.name}
          fallback={t("imageFallback")}
        />
      </Link>
      <CardHeader>
        {category ? <CardDescription>{category}</CardDescription> : null}
        <CardTitle>
          <Link href={`/catalog/${product.id}`} className="hover:underline">
            {product.name}
          </Link>
        </CardTitle>
        <CardDescription>
          <Link href={`/manufacturers/${product.manufacturer.id}`} className="hover:underline">
            {product.manufacturer.name}
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 text-muted-foreground">
        <p>
          {product.lead_time_days === 0
            ? t("readyNow")
            : product.lead_time_days === null
              ? t("leadUnavailable")
              : t("leadDays", {
                  count: new Intl.NumberFormat(locale).format(product.lead_time_days),
                })}
        </p>
        <p>{product.orderable ? t("orderable") : t("notOrderable")}</p>
      </CardContent>
      <CardFooter className="text-muted-foreground">
        {showWholesale
          ? representativePriceIrr === null || representativePriceIrr === undefined
            ? t("priceUnavailable")
            : t("priceFrom", {
                amount: formatToman(representativePriceIrr, locale),
              })
          : t("priceProtected")}
      </CardFooter>
    </Card>
  );
}

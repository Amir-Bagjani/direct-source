"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { productPreviewOptions } from "../../queries/catalog-management.queries";
import { attributeValueText } from "../../utils/attribute-value-text";
import { ProductGallery } from "../product-gallery/product-gallery";
import { ProductImage } from "../product-image/product-image";
import { PriceTable } from "../price-table/price-table";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/shared/ui/card/card";
import { ToggleGroup, ToggleGroupItem } from "@/shared/ui/toggle-group/toggle-group";
import { Alert, AlertTitle, AlertDescription } from "@/shared/ui/alert/alert";
import { Button } from "@/shared/ui/button/button";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/shared/ui/collapsible/collapsible";
import { Badge } from "@/shared/ui/badge/badge";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
  TableCaption,
} from "@/shared/ui/table/table";
import type { ProductPreviewProps } from "./product-preview.types";

export function ProductPreview({ scope, id, enabled }: ProductPreviewProps) {
  const t = useTranslations("catalogManagement.preview");
  const catalog = useTranslations("catalog");
  const common = useTranslations("common");
  const locale = useLocale();
  const format = useFormatter();
  const [retailer, setRetailer] = useState(false);
  const query = useQuery({ ...productPreviewOptions(scope, id), enabled });
  const product = enabled && query.isSuccess && !query.isFetching ? query.data : undefined;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("title")}</h2>
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-6">
        <ToggleGroup
          variant="outline"
          multiple={false}
          value={[retailer ? "retailer" : "public"]}
          aria-label={t("mode")}
          className="flex-wrap"
          onValueChange={(values) => {
            if (values[0]) setRetailer(values[0] === "retailer");
          }}
        >
          <ToggleGroupItem value="public">{t("public")}</ToggleGroupItem>
          <ToggleGroupItem value="retailer">{t("retailer")}</ToggleGroupItem>
        </ToggleGroup>
        {query.isError ? (
          <Alert variant="destructive">
            <AlertTitle>{t("unavailable")}</AlertTitle>
            <AlertDescription>
              <Button variant="outline" disabled={!enabled} onClick={() => void query.refetch()}>
                {common("retry")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : !product ? (
          <p role="status">{common("loading")}</p>
        ) : (
          <article className="grid min-w-0 gap-6" aria-label={t("content")}>
            <div className="grid min-w-0 gap-6 lg:grid-cols-2">
              <ProductGallery
                key={product.image_urls.join("\n")}
                name={product.name}
                images={product.image_urls}
              />
              <div className="grid content-start gap-4">
                <h3 className="text-2xl font-semibold">
                  <bdi>{product.name}</bdi>
                </h3>
                <p className="text-sm text-muted-foreground">
                  <bdi>{product.category_path.map((category) => category.name).join(" / ")}</bdi>
                </p>
                {product.brand && (
                  <p>
                    <bdi>{product.brand}</bdi>
                  </p>
                )}
                {product.manufacturer_model && (
                  <p>
                    {catalog("model")}: <bdi>{product.manufacturer_model}</bdi>
                  </p>
                )}
                <p className="whitespace-pre-wrap leading-7">
                  <bdi>{product.description}</bdi>
                </p>
                <p className="font-medium">
                  <bdi>{product.manufacturer.name}</bdi>
                </p>
                {product.manufacturer.verified && (
                  <Badge variant="outline">{catalog("manufacturer.verified")}</Badge>
                )}
                {product.manufacturer.description && (
                  <p className="text-sm text-muted-foreground">
                    <bdi>{product.manufacturer.description}</bdi>
                  </p>
                )}
                <dl className="grid gap-3">
                  {product.display_attributes.map((attribute) => (
                    <div key={attribute.code}>
                      <dt className="text-sm text-muted-foreground">
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
              </div>
            </div>
            {!retailer ? (
              <Alert>
                <AlertTitle>{catalog("priceProtected")}</AlertTitle>
                <AlertDescription>{t("publicHint")}</AlertDescription>
              </Alert>
            ) : product.wholesale ? (
              <PriceTable
                tiers={product.wholesale.tiers}
                variants={product.variants}
                caption={catalog("wholesale.caption")}
              />
            ) : (
              <p>{catalog("priceUnavailable")}</p>
            )}
            <section aria-label={t("methods")} className="grid gap-3">
              <h3 className="text-lg font-semibold">{t("methods")}</h3>
              {product.sale_methods.length ? (
                <div className="flex flex-wrap gap-2">
                  {product.sale_methods.map((method) => (
                    <Badge key={method} variant="secondary">
                      {catalog(`method.${method}`)}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p>{t("noMethods")}</p>
              )}
              {product.free_mix_min && (
                <p>{catalog("wholesale.freeMixMinimum", { count: product.free_mix_min })}</p>
              )}
              {product.packs.map((pack) => (
                <div key={pack.code} className="grid gap-1">
                  <p className="font-medium">
                    <bdi>{pack.name}</bdi>
                  </p>
                  <ul className="grid gap-1 text-sm text-muted-foreground">
                    {pack.items.map((item) => (
                      <li key={item.variant}>
                        <bdi>
                          {product.variants.find((variant) => variant.id === item.variant)?.sku ??
                            item.variant}
                        </bdi>{" "}
                        · {format.number(item.quantity)}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
            <Table>
              <TableCaption className="sr-only">
                {catalog("variants.comparisonCaption")}
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>{catalog("variants.image")}</TableHead>
                  <TableHead>{catalog("variants.sku")}</TableHead>
                  <TableHead>{catalog("specifications")}</TableHead>
                  <TableHead>{catalog("variants.readyHeading")}</TableHead>
                  <TableHead>{catalog("variants.productionHeading")}</TableHead>
                  <TableHead>{catalog("card.preparation")}</TableHead>
                  <TableHead>{catalog("filters.availability")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {product.variants.map((variant) => (
                  <TableRow key={variant.id}>
                    <TableCell>
                      <ProductImage
                        src={variant.image_urls[0]}
                        alt={variant.sku}
                        fallback=""
                        className="size-16"
                        sizes="64px"
                      />
                    </TableCell>
                    <TableCell>
                      <bdi>{variant.sku}</bdi>
                    </TableCell>
                    <TableCell>
                      <dl className="grid gap-2">
                        {variant.display_attributes.map((attribute) => (
                          <div key={attribute.code}>
                            <dt className="text-sm text-muted-foreground">
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
                        : catalog("variants.noSupply")}
                    </TableCell>
                    <TableCell>
                      {variant.supply
                        ? format.number(variant.supply.production_cap)
                        : catalog("variants.noSupply")}
                    </TableCell>
                    <TableCell>
                      {variant.supply ? (
                        <div className="grid gap-1">
                          <p>{catalog(`supply.${variant.supply.mode}`)}</p>
                          {variant.supply.ready_stock > 0 && <p>{catalog("readyNow")}</p>}
                          {variant.supply.production_cap > 0 && (
                            <p>
                              {catalog("variants.productionDays", {
                                count: format.number(variant.supply.lead_time_days),
                              })}
                            </p>
                          )}
                        </div>
                      ) : (
                        catalog("variants.noSupply")
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={variant.orderable ? "secondary" : "outline"}>
                        {catalog(variant.orderable ? "orderable" : "notOrderable")}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p aria-hidden="true" className="text-sm text-muted-foreground">
              {catalog("variants.comparisonCaption")}
            </p>
            {product.variants
              .filter((variant) => variant.image_urls.length > 0)
              .map((variant) => (
                <Collapsible key={variant.id} className="grid gap-3">
                  <CollapsibleTrigger render={<Button variant="outline" />}>
                    {catalog("variants.viewImages", { sku: variant.sku })}
                  </CollapsibleTrigger>
                  <CollapsibleContent className="max-w-xl">
                    <ProductGallery
                      key={variant.image_urls.join("\n")}
                      name={variant.sku}
                      images={variant.image_urls}
                    />
                  </CollapsibleContent>
                </Collapsible>
              ))}
            {!product.variants.length && <p>{catalog("variants.empty")}</p>}
            <section aria-label={catalog("shipping.title")} className="grid gap-3">
              <h3 className="text-lg font-semibold">{catalog("shipping.title")}</h3>
              <p className="text-sm text-muted-foreground">{catalog("shipping.costHint")}</p>
              {product.shipping_services.length ? (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {product.shipping_services.map((service) => (
                    <li key={service.id}>
                      <p className="font-medium">
                        <bdi>{service.name}</bdi>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {catalog("shipping.deliveryRange", {
                          min: format.number(service.delivery_days_min),
                          max: format.number(service.delivery_days_max),
                        })}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>{catalog("shipping.unavailable")}</p>
              )}
            </section>
          </article>
        )}
      </CardContent>
    </Card>
  );
}

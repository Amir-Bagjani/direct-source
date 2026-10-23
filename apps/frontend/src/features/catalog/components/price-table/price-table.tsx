"use client";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table/table";
import { formatToman } from "../../utils/money";
import type { PriceTableProps } from "./price-table.types";

export function PriceTable({ tiers, variants, caption }: PriceTableProps) {
  const t = useTranslations("catalog");
  const locale = useLocale();
  const format = useFormatter();
  return (
    <div className="grid gap-2">
      <p className="text-sm text-muted-foreground">{t("wholesale.scrollHint")}</p>
      <Table>
        <TableCaption>{caption}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>{t("wholesale.quantity")}</TableHead>
            <TableHead>{t("wholesale.defaultPrice")}</TableHead>
            {variants.map((variant) => (
              <TableHead key={variant.id}>
                <bdi>{variant.sku}</bdi>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {tiers.map((tier) => (
            <TableRow key={tier.min_quantity}>
              <TableCell>
                {tier.max_quantity === null
                  ? t("wholesale.openRange", { min: format.number(tier.min_quantity) })
                  : t("wholesale.closedRange", {
                      min: format.number(tier.min_quantity),
                      max: format.number(tier.max_quantity),
                    })}
              </TableCell>
              <TableCell>
                {t("tomanAmount", { amount: formatToman(tier.unit_price_irr, locale) })}
              </TableCell>
              {variants.map((variant) => {
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
    </div>
  );
}

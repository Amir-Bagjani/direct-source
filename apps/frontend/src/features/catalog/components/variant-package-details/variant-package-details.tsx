"use client";
import { useFormatter, useTranslations } from "next-intl";
import type { ShippingInput } from "../../schemas/catalog-management.schema";
export function VariantPackageDetails({
  value,
}: {
  value: Omit<ShippingInput["packages"][number], "variant">;
}) {
  const t = useTranslations("catalogManagement.package"),
    format = useFormatter();
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {(
        [
          ["weight_g", "weight"],
          ["length_mm", "length"],
          ["width_mm", "width"],
          ["height_mm", "height"],
          ["package_count", "count"],
        ] as const
      ).map(([key, label]) => (
        <div key={key}>
          <dt className="text-sm text-muted-foreground">{t(label)}</dt>
          <dd>{format.number(value[key])}</dd>
        </div>
      ))}
    </dl>
  );
}

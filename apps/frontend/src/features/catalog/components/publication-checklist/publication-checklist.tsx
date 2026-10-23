"use client";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/shared/ui/badge/badge";
import type { PublicationReadiness } from "../../schemas/catalog-management.schema";

const targets = {
  business: "/account/business",
  content: "#baseProduct",
  variants: "#variants",
  supply: "#supply",
  pricing: "#salesAndPricing",
  shipping: "#shipping",
};
export function PublicationChecklist({
  readiness,
  links = false,
}: {
  readiness: PublicationReadiness;
  links?: boolean;
}) {
  const t = useTranslations("catalogManagement.checklist");
  return (
    <section aria-label={t("title")} className="grid gap-3">
      <h3 className="text-lg font-semibold">{t("title")}</h3>
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {readiness.checks.map((check) => (
          <li key={check.code} className="grid gap-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{t(`sections.${check.code}`)}</p>
              <Badge variant={check.passed ? "secondary" : "outline"}>
                {t(check.passed ? "complete" : "incomplete")}
              </Badge>
            </div>
            {!check.passed && (
              <>
                <p className="text-sm text-muted-foreground">{t(`hints.${check.code}`)}</p>
                {links && (
                  <Link href={targets[check.code]} className="text-sm underline underline-offset-4">
                    {t("edit")}
                  </Link>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      <p role="status" className="text-sm">
        {t(readiness.ready ? "ready" : "blocked")}
      </p>
    </section>
  );
}

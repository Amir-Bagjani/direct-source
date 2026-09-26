import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/shared/ui/card/card";
import { buttonVariants } from "@/shared/ui/button/button.variants";
import { cn } from "@/shared/ui/cn";
import type { PolicyDocumentProps } from "./policy-document.types";

const sections = {
  terms: ["scope", "account", "business", "conduct", "transactions", "access", "changes"],
  privacy: ["collection", "purpose", "visibility", "storage", "retention", "cookies", "requests"],
} as const;

export async function PolicyDocument({ kind }: PolicyDocumentProps) {
  const t = await getTranslations(`accounts.policies.${kind}`);
  const labels = await getTranslations("accounts.policies");
  return (
    <article className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>
            <h1>{t("title")}</h1>
          </CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {sections[kind].map((key) => (
            <section key={key} aria-labelledby={`policy-${key}`} className="flex flex-col gap-2">
              <h2 id={`policy-${key}`} className="text-base font-semibold">
                {t(`sections.${key}.title`)}
              </h2>
              <p className="leading-relaxed">{t(`sections.${key}.body`)}</p>
            </section>
          ))}
        </CardContent>
      </Card>
      <nav aria-label={labels("navigation")} className="flex flex-wrap gap-3">
        <Link href="/register" className={cn(buttonVariants())}>
          {labels("register")}
        </Link>
        <Link
          className={cn(buttonVariants({ variant: "outline" }))}
          href={kind === "terms" ? "/privacy" : "/terms"}
        >
          {labels(kind === "terms" ? "privacy.title" : "terms.title")}
        </Link>
      </nav>
    </article>
  );
}

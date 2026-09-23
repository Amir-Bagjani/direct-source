"use client";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/ui/button/button";
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("common");
  return (
    <main role="alert">
      <p>{t("error")}</p>
      <Button onClick={reset}>{t("retry")}</Button>
    </main>
  );
}

"use client";
import { useTranslations } from "next-intl";
import { useQueryErrorResetBoundary } from "@tanstack/react-query";
import { Alert, AlertTitle } from "@/shared/ui/alert/alert";
import { Button } from "@/shared/ui/button/button";
export default function ErrorPage({ retry }: { error: Error; retry: () => void }) {
  const t = useTranslations("common");
  const { reset } = useQueryErrorResetBoundary();
  return (
    <main id="main" className="mx-auto grid max-w-5xl gap-4 px-4 py-16">
      <Alert variant="destructive">
        <AlertTitle>{t("error")}</AlertTitle>
      </Alert>
      <Button
        className="justify-self-start"
        onClick={() => {
          reset();
          retry();
        }}
      >
        {t("retry")}
      </Button>
    </main>
  );
}

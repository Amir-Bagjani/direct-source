"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Alert, AlertDescription } from "@/shared/ui/alert/alert";
import { Spinner } from "@/shared/ui/spinner/spinner";
import { challengeInputSchema } from "../../schemas/recovery.schema";
import { ChallengeForm } from "../challenge-form/challenge-form";

export function ChallengeScreen() {
  const t = useTranslations("accounts.recovery");
  const common = useTranslations("common");
  const secret = useRef("");
  const [purpose, setPurpose] = useState<"verify" | "reset" | "invalid" | null>(null);
  const [completed, setCompleted] = useState(false);
  useEffect(() => {
    const capture = () => {
      const parsed = challengeInputSchema.safeParse(
        Object.fromEntries(new URLSearchParams(window.location.hash.slice(1))),
      );
      secret.current = parsed.success ? parsed.data.token : "";
      setPurpose(parsed.success && !window.location.search ? parsed.data.purpose : "invalid");
      setCompleted(false);
    };
    capture();
    window.addEventListener("hashchange", capture);
    return () => {
      window.removeEventListener("hashchange", capture);
      secret.current = "";
    };
  }, []);
  if (!purpose)
    return (
      <p role="status" className="flex items-center gap-2">
        <Spinner aria-hidden="true" />
        {common("loading")}
      </p>
    );
  if (purpose === "invalid")
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="destructive">
          <AlertDescription>{t("invalidLink")}</AlertDescription>
        </Alert>
        <Link href="/forgot-password">{t("newLink")}</Link>
        <Link href="/account">{t("account")}</Link>
      </div>
    );
  if (completed)
    return (
      <div className="flex flex-col gap-4">
        <Alert role="status">
          <AlertDescription>{t(purpose === "reset" ? "resetDone" : "verifyDone")}</AlertDescription>
        </Alert>
        <Link href={purpose === "reset" ? "/login" : "/account"}>
          {t(purpose === "reset" ? "login" : "account")}
        </Link>
      </div>
    );
  return (
    <ChallengeForm
      purpose={purpose}
      readToken={() => secret.current}
      onComplete={() => {
        secret.current = "";
        setCompleted(true);
      }}
    />
  );
}

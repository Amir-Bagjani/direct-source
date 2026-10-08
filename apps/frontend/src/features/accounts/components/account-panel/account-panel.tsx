"use client";
import { accountKeys } from "../../queries/accounts.keys";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ApiError } from "@/shared/api/unwrap";
import { Button } from "@/shared/ui/button/button";
import { Alert, AlertDescription } from "@/shared/ui/alert/alert";
import { Spinner } from "@/shared/ui/spinner/spinner";
import { TrustPanel } from "../trust-panel/trust-panel";
import { VerificationReview } from "../verification-review/verification-review";
import { BusinessPanel } from "../business-panel/business-panel";
import { EmailSettings } from "../email-settings/email-settings";
import { sessionOptions } from "../../queries/session.queries";
import { useLogout } from "../../hooks/use-session-mutations";
import { announceSessionChange, listenForSessionChange } from "../../client/session-events";

export function AccountPanel() {
  const t = useTranslations("accounts.account");
  const common = useTranslations("common");
  const locale = useLocale();
  const client = useQueryClient();
  const privateRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const query = useQuery({ ...sessionOptions(epoch), enabled: active && !blocked });
  const mutation = useLogout();

  useEffect(() => {
    const hide = () => {
      if (privateRef.current) privateRef.current.hidden = true;
      setActive(false);
      void client.cancelQueries();
      client.removeQueries({ queryKey: accountKeys.all });
    };
    const resume = () => {
      if (document.visibilityState === "visible") {
        setEpoch((value) => value + 1);
        setActive(true);
      }
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") hide();
      else resume();
    };
    const invalidate = () => {
      hide();
      client.clear();
      window.location.replace(`/${locale}`);
    };
    const stop = listenForSessionChange(invalidate);
    resume();
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", resume);
    const focus = () => {
      void client.invalidateQueries({ queryKey: accountKeys.sessions() });
    };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      stop();
      hide();
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [client, locale]);

  const show = active && !blocked && query.isSuccess && !query.isFetching;
  useEffect(() => {
    if (privateRef.current) privateRef.current.hidden = !show;
  }, [show, query.dataUpdatedAt]);
  useEffect(() => {
    if (query.error instanceof ApiError && query.error.status === 401 && !blocked) {
      client.clear();
      announceSessionChange();
      window.location.replace(`/${locale}/login`);
    }
  }, [query.error, client, locale, blocked]);

  async function leave() {
    setBlocked(true);
    if (privateRef.current) privateRef.current.hidden = true;
    await client.cancelQueries();
    client.clear();
    announceSessionChange();
    mutation.mutate(undefined, {
      onSuccess: () => {
        client.clear();
        window.location.replace(`/${locale}`);
      },
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div ref={privateRef} hidden={!show} className="flex flex-col gap-4">
        {query.data && (
          <>
            <p>
              {t("name")}:{" "}
              <bdi>
                {query.data.first_name} {query.data.last_name}
              </bdi>
            </p>
            <p>
              {t("mobile")}: <bdi dir="ltr">{query.data.mobile}</bdi>
            </p>
            <p>
              {t("email")}: <bdi dir="auto">{query.data.email || t("noEmail")}</bdi>
            </p>
            <p>{t(query.data.email_verified_at ? "emailVerified" : "emailUnverified")}</p>
            <BusinessPanel key={`business:${query.data.id}:${epoch}`} userId={query.data.id} />
            <VerificationReview key={`review:${query.data.id}:${epoch}`} userId={query.data.id} />
            <TrustPanel key={`trust:${query.data.id}:${epoch}`} userId={query.data.id} />
            <EmailSettings
              key={query.data.id}
              email={query.data.email}
              verified={!!query.data.email_verified_at}
            />
          </>
        )}
      </div>
      {(!active || query.isPending || query.isFetching || mutation.isPending) &&
        !mutation.isError && (
          <p role="status" className="flex items-center gap-2">
            <Spinner aria-hidden="true" />
            {common("loading")}
          </p>
        )}
      {(query.isError || mutation.isError) && (
        <Alert variant="destructive">
          <AlertDescription>{t(blocked ? "logoutUncertain" : "unavailable")}</AlertDescription>
        </Alert>
      )}
      {query.isError && !blocked && (
        <Button
          onClick={() => {
            setEpoch((value) => value + 1);
          }}
        >
          {common("retry")}
        </Button>
      )}
      <Button onClick={() => void leave()} disabled={mutation.isPending}>
        {t(blocked && mutation.isError ? "retryLogout" : "logout")}
      </Button>
      <Button variant="outline" render={<Link href="/account/catalog" />}>
        {t("catalogWorkspace")}
      </Button>
      <Link href="/">{common("backHome")}</Link>
    </div>
  );
}

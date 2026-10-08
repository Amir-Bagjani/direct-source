"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { ApiError } from "@/shared/api/unwrap";
import { Spinner } from "@/shared/ui/spinner/spinner";
import { listenForSessionChange } from "../../client/session-events";
import { sessionOptions } from "../../queries/session.queries";

export function ProtectedSessionBoundary({ children }: { children: ReactNode }) {
  const t = useTranslations("common");
  const locale = useLocale();
  const client = useQueryClient();
  const [active, setActive] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const query = useQuery({ ...sessionOptions(epoch), enabled: active });

  useEffect(() => {
    const hide = () => {
      setActive(false);
      void client.cancelQueries();
      client.clear();
    };
    const resume = () => {
      if (document.visibilityState === "visible") {
        setEpoch((value) => value + 1);
        setActive(true);
      }
    };
    const visibility = () => (document.visibilityState === "hidden" ? hide() : resume());
    const invalidate = () => {
      hide();
      window.location.replace(`/${locale}`);
    };
    const stop = listenForSessionChange(invalidate);
    resume();
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      stop();
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", resume);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [client, locale]);

  const ready = active && query.isSuccess && !query.isFetching;
  useEffect(() => {
    if (query.error instanceof ApiError && query.error.status === 401) {
      client.clear();
      window.location.replace(`/${locale}/login`);
    }
  }, [client, locale, query.error]);

  if (ready) return children;
  return (
    <p
      role="status"
      className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-12 sm:px-6"
    >
      <Spinner aria-hidden="true" />
      {t("loading")}
    </p>
  );
}

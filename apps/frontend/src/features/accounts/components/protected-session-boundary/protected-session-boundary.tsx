"use client";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient, hashKey } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import type { z } from "zod";
import { ApiError } from "@/shared/api/unwrap";
import { cn } from "@/shared/ui/cn";
import { Alert, AlertDescription } from "@/shared/ui/alert/alert";
import { Button } from "@/shared/ui/button/button";
import { Spinner } from "@/shared/ui/spinner/spinner";
import { PortalContainer } from "@/shared/ui/portal-container/portal-container";
import {
  announceSessionChange,
  listenForSessionChange,
  listenForSessionClosing,
} from "../../client/session-events";
import { accountKeys } from "../../queries/accounts.keys";
import { sessionOptions } from "../../queries/session.queries";
import { useLogout } from "../../hooks/use-session-mutations";
import { registeredUserSchema } from "../../schemas/registration.schema";
import { ProtectedSessionContext } from "./protected-session-context";

export function ProtectedSessionBoundary({ children }: { children: ReactNode }) {
  const common = useTranslations("common");
  const t = useTranslations("accounts.account");
  const locale = useLocale();
  const client = useQueryClient();
  const content = useRef<HTMLDivElement>(null);
  const focused = useRef<HTMLElement | null>(null);
  const [active, setActive] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [externalClosing, setExternalClosing] = useState(false);
  // This snapshot keeps masked same-user drafts mounted, never authorizes requests,
  // and is discarded on logout, 401 or identity change.
  const [identity, setIdentity] = useState<z.infer<typeof registeredUserSchema>>();
  const query = useQuery({ ...sessionOptions(0), enabled: active && !blocked });
  const mutation = useLogout();
  const changedIdentity = !!identity && !!query.data && identity.id !== query.data.id;
  const authorized = active && !blocked && !changedIdentity && query.isSuccess && !query.isFetching;

  useEffect(() => {
    const hide = () => {
      if (content.current) {
        content.current.style.visibility = "hidden";
        content.current.inert = true;
      }
      setActive(false);
      void client.cancelQueries();
      client.clear();
    };
    const resume = () => {
      if (document.visibilityState === "visible") {
        setActive(true);
        void client.invalidateQueries({ queryKey: accountKeys.sessions() });
      }
    };
    const visibility = () => (document.visibilityState === "hidden" ? hide() : resume());
    const invalidate = () => {
      hide();
      setBlocked(true);
      setIdentity(undefined);
      window.location.replace(`/${locale}`);
    };
    const rememberFocus = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement && content.current?.contains(event.target))
        focused.current = event.target;
      else if (event.target !== document.body) focused.current = null;
    };
    const stop = listenForSessionChange(invalidate);
    const stopClosing = listenForSessionClosing((failed) => {
      hide();
      setBlocked(true);
      setIdentity(undefined);
      setExternalClosing(!failed);
    });
    resume();
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", resume);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("focusin", rememberFocus);
    return () => {
      stop();
      stopClosing();
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("focusin", rememberFocus);
    };
  }, [client, locale]);

  useEffect(
    () =>
      client.getQueryCache().subscribe((event) => {
        if (event.type !== "updated" || event.query.queryHash !== hashKey(accountKeys.session(0)))
          return;
        const error = event.query.state.error;
        if (event.action.type === "error" && error instanceof ApiError && error.status === 401) {
          setBlocked(true);
          setIdentity(undefined);
          void client.cancelQueries();
          client.clear();
          announceSessionChange();
          window.location.replace(`/${locale}/login`);
        } else if (event.action.type === "success") {
          const user = registeredUserSchema.safeParse(event.query.state.data);
          if (!user.success) return;
          if (identity && identity.id !== user.data.id) {
            setBlocked(true);
            setIdentity(undefined);
            void client.cancelQueries();
            client.clear();
            announceSessionChange();
            window.location.replace(`/${locale}/login`);
          } else setIdentity(user.data);
        }
      }),
    [client, locale, identity],
  );

  useLayoutEffect(() => {
    if (content.current) {
      content.current.style.visibility = authorized ? "visible" : "hidden";
      content.current.inert = !authorized;
    }
    if (authorized && focused.current?.isConnected && document.activeElement === document.body)
      focused.current.focus({ preventScroll: true });
  }, [authorized]);

  async function leave() {
    setBlocked(true);
    setExternalClosing(false);
    setIdentity(undefined);
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
    <div className="relative">
      {identity && !blocked && (
        <ProtectedSessionContext
          value={{ user: identity, authorized, logout: leave, loggingOut: mutation.isPending }}
        >
          <PortalContainer
            ref={content}
            inert={!authorized}
            aria-hidden={!authorized}
            className={cn(!authorized && "invisible")}
          >
            {children}
          </PortalContainer>
        </ProtectedSessionContext>
      )}
      {!authorized && (
        <div
          className={cn(
            "mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-12 sm:px-6",
            identity && "absolute inset-0 bg-background",
          )}
        >
          <div className="sticky top-4 flex flex-col gap-4">
            {query.isError ||
            mutation.isError ||
            (blocked && !mutation.isPending && !externalClosing) ? (
              <>
                <Alert variant="destructive">
                  <AlertDescription>
                    {t(blocked ? "logoutUncertain" : "unavailable")}
                  </AlertDescription>
                </Alert>
                <Button
                  className="self-start"
                  disabled={query.isFetching || mutation.isPending}
                  onClick={() => (blocked ? void leave() : void query.refetch())}
                >
                  {blocked ? t("retryLogout") : common("retry")}
                </Button>
              </>
            ) : (
              <p role="status" className="flex items-center gap-2">
                <Spinner aria-hidden="true" />
                {common("loading")}
              </p>
            )}
            {!blocked && (
              <Button
                className="self-start"
                onClick={() => void leave()}
                disabled={mutation.isPending}
              >
                {t("logout")}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

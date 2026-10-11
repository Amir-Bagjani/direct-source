"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@/i18n/navigation";
import { ApiError } from "@/shared/api/unwrap";
import { Button } from "@/shared/ui/button/button";
import { buttonVariants } from "@/shared/ui/button/button.variants";
import { Alert, AlertDescription } from "@/shared/ui/alert/alert";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/shared/ui/dropdown-menu/dropdown-menu";
import { sessionOptions } from "../../queries/session.queries";
import { businessOptions } from "../../queries/business.queries";
import { trustOptions } from "../../queries/trust.queries";
import { trustAccessSchema } from "../../schemas/trust.schema";
import { useLogout } from "../../hooks/use-session-mutations";
import { announceSessionChange, notifySessionClosing } from "../../client/session-events";
export function HeaderAccountMenu({ sessionPresent }: { sessionPresent: boolean }) {
  const t = useTranslations("accounts.workspace");
  const account = useTranslations("accounts.account");
  const common = useTranslations("common");
  const locale = useLocale();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const session = useQuery({
    ...sessionOptions(0),
    enabled: open && sessionPresent && !closing,
    refetchInterval: false,
  });
  const valid = session.isSuccess && !session.isFetching && !closing;
  const business = useQuery({ ...businessOptions(session.data?.id ?? ""), enabled: open && valid });
  const role = useQuery({
    ...trustOptions(session.data?.id ?? "", "access", trustAccessSchema),
    enabled: open && valid,
  });
  const logout = useLogout();
  async function leave() {
    setClosing(true);
    setOpen(false);
    notifySessionClosing();
    await client.cancelQueries();
    client.clear();
    announceSessionChange();
    logout.mutate(undefined, {
      onSuccess: () => {
        client.clear();
        window.location.replace(`/${locale}`);
      },
      onError: () => notifySessionClosing(true),
    });
  }
  if (!sessionPresent || (session.error instanceof ApiError && session.error.status === 401))
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/login" className={buttonVariants({ variant: "ghost" })}>
          {t("signIn")}
        </Link>
        <Link href="/register" className={buttonVariants({ variant: "outline" })}>
          {t("register")}
        </Link>
      </div>
    );
  if (closing)
    return (
      <div className="flex flex-col gap-2">
        {logout.isError ? (
          <>
            <Alert variant="destructive">
              <AlertDescription>{account("logoutUncertain")}</AlertDescription>
            </Alert>
            <Button onClick={() => void leave()}>{account("retryLogout")}</Button>
          </>
        ) : (
          <p role="status">{common("loading")}</p>
        )}
      </div>
    );
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger render={<Button variant="outline" />} aria-label={t("accountMenu")}>
        {account("title")}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-56 [&_[data-slot=dropdown-menu-item]]:min-h-11"
      >
        <DropdownMenuGroup>
          {!valid ? (
            <DropdownMenuItem disabled>
              {session.isError ? account("unavailable") : common("loading")}
            </DropdownMenuItem>
          ) : (
            <>
              {[
                ["/account", "overview"],
                ["/account/business", "business"],
                ["/account/security", "security"],
              ].map(([href, key]) => (
                <DropdownMenuItem key={href} render={<Link href={href!} />}>
                  {t(key!)}
                </DropdownMenuItem>
              ))}
              {business.isSuccess &&
                business.data?.kind === "manufacturer" &&
                business.data.status !== "suspended" && (
                  <DropdownMenuItem render={<Link href="/account/catalog" />}>
                    {t("workspace")}
                  </DropdownMenuItem>
                )}
              {role.isSuccess && !role.isFetching && (
                <>
                  <DropdownMenuItem render={<Link href="/account/operations/businesses" />}>
                    {t("operations")}
                  </DropdownMenuItem>
                  <DropdownMenuItem render={<Link href="/account/catalog/operations" />}>
                    {t("workspace")}
                  </DropdownMenuItem>
                  <DropdownMenuItem render={<Link href="/account/operations/trust" />}>
                    {t("trust")}
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void leave()}>{account("logout")}</DropdownMenuItem>
            </>
          )}
          {session.isError && (
            <DropdownMenuItem onClick={() => void session.refetch()}>
              {common("retry")}
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

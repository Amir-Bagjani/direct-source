"use client";
import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Link, usePathname } from "@/i18n/navigation";
import { Button } from "@/shared/ui/button/button";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
} from "@/shared/ui/sidebar/sidebar";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/shared/ui/sheet/sheet";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/shared/ui/breadcrumb/breadcrumb";
import { useProtectedSession } from "../protected-session-boundary/protected-session-context";
import { businessOptions } from "../../queries/business.queries";
import { trustOptions } from "../../queries/trust.queries";
import { trustAccessSchema } from "../../schemas/trust.schema";

export function AccountShell({ children }: { children: ReactNode }) {
  const t = useTranslations("accounts.workspace");
  const account = useTranslations("accounts.account");
  const pathname = usePathname();
  const { user, authorized, logout, loggingOut } = useProtectedSession();
  const [open, setOpen] = useState(false);
  const role = useQuery({
    ...trustOptions(user.id, "access", trustAccessSchema),
    enabled: authorized,
  });
  const business = useQuery({ ...businessOptions(user.id), enabled: authorized });
  const manufacturer =
    business.isSuccess &&
    !business.isFetching &&
    business.data?.kind === "manufacturer" &&
    business.data.status !== "suspended";
  const links = [
    ["/account", "overview"],
    ["/account/profile", "profile"],
    ["/account/security", "security"],
    ["/account/business", "business"],
    ["/account/business/verification", "verification"],
    ["/account/business/documents", "documents"],
    ["/account/business/revisions", "revisions"],
    ["/account/access", "access"],
    ...(role.isSuccess && !role.isFetching
      ? [
          ["/account/operations/businesses", "operations"],
          ["/account/operations/trust", "trust"],
        ]
      : []),
    ...(manufacturer || (role.isSuccess && !role.isFetching)
      ? [["/account/catalog", "workspace"]]
      : []),
  ] as const;
  const current = links.find(([href]) => pathname === href)?.[1] ?? "case";
  const navigation = (
    <nav aria-label={t("navigation")}>
      <SidebarMenu>
        {links.map(([href, label]) => (
          <SidebarMenuItem key={href}>
            <SidebarMenuButton
              size="lg"
              isActive={pathname === href}
              render={
                <Link
                  href={href}
                  aria-current={pathname === href ? "page" : undefined}
                  onClick={() => setOpen(false)}
                />
              }
            >
              {t(label)}
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </nav>
  );
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-10">
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/account" />}>{account("title")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t(current)}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <SidebarProvider className="min-h-0 items-start gap-8">
        <Sidebar collapsible="none" className="hidden w-56 shrink-0 md:flex">
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>{account("title")}</SidebarGroupLabel>
              {navigation}
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <Button variant="outline" disabled={loggingOut} onClick={() => void logout()}>
              {account("logout")}
            </Button>
          </SidebarFooter>
        </Sidebar>
        <main id="main" className="flex min-w-0 flex-1 flex-col gap-6">
          <div className="md:hidden">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger
                render={<Button variant="outline" className="w-full justify-between" />}
              >
                {t(current)}
              </SheetTrigger>
              <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>{t("navigation")}</SheetTitle>
                  <SheetDescription>{t("navigationHint")}</SheetDescription>
                </SheetHeader>
                <div className="px-4 pb-6">
                  {navigation}
                  <Button
                    className="mt-4 w-full"
                    variant="outline"
                    disabled={loggingOut}
                    onClick={() => void logout()}
                  >
                    {account("logout")}
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
          {children}
        </main>
      </SidebarProvider>
    </div>
  );
}

"use client";
import { useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { LanguageSwitcher } from "@/shared/ui/language-switcher/language-switcher";
import { ThemeSwitcher } from "@/shared/ui/theme-switcher/theme-switcher";
import { Button } from "@/shared/ui/button/button";
import { buttonVariants } from "@/shared/ui/button/button.variants";
import { Input } from "@/shared/ui/input/input";
import { Field, FieldLabel } from "@/shared/ui/field/field";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/shared/ui/sheet/sheet";
import type { Theme } from "@/shared/theme/theme";
export function SiteHeader({
  initialTheme,
  accountNavigation,
}: {
  initialTheme: Theme;
  accountNavigation: ReactNode;
}) {
  const t = useTranslations("nav");
  const meta = useTranslations("meta");
  const w = useTranslations("accounts.workspace");
  const locale = useLocale();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <header className="border-b bg-background">
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:rounded-lg focus:bg-primary focus:p-3 focus:text-primary-foreground"
        href="#main"
      >
        {t("skip")}
      </a>
      <div className="mx-auto grid w-full max-w-7xl grid-cols-[1fr_auto] items-center gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[auto_auto_1fr_auto]">
        <Link href="/" className="col-span-2 flex min-h-11 flex-col justify-center lg:col-span-1">
          <span className="font-semibold">{meta("title")}</span>
          <span className="text-xs text-muted-foreground">{w("guestHint")}</span>
        </Link>
        <nav className="hidden lg:block" aria-label={t("primary")}>
          <Link
            href="/catalog"
            aria-current={path.startsWith("/catalog") ? "page" : undefined}
            className={buttonVariants({
              variant: path.startsWith("/catalog") ? "secondary" : "ghost",
            })}
          >
            {t("catalog")}
          </Link>
        </nav>
        <form
          action={`/${locale}/catalog`}
          method="get"
          role="search"
          aria-label={w("searchLabel")}
          className="order-last col-span-2 flex min-w-0 gap-2 lg:order-none lg:col-span-1"
        >
          <Field className="min-w-0">
            <FieldLabel htmlFor="site-search" className="sr-only">
              {w("searchLabel")}
            </FieldLabel>
            <Input
              id="site-search"
              name="q"
              type="search"
              placeholder={w("searchPlaceholder")}
              maxLength={200}
            />
          </Field>
          <Button type="submit" aria-label={w("searchLabel")}>
            {w("search")}
          </Button>
        </form>
        <div className="col-span-2 flex flex-wrap items-center gap-2 lg:col-span-1 lg:justify-end">
          <div className="hidden items-center gap-2 lg:flex">
            <LanguageSwitcher />
            <ThemeSwitcher initialTheme={initialTheme} />
          </div>
          {accountNavigation}
          <div className="ms-auto lg:hidden">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger render={<Button variant="outline" />}>{w("menu")}</SheetTrigger>
              <SheetContent side="bottom">
                <SheetHeader>
                  <SheetTitle>{t("primary")}</SheetTitle>
                  <SheetDescription>{w("guestHint")}</SheetDescription>
                </SheetHeader>
                <div className="flex flex-col gap-4 px-4 pb-6">
                  <Link
                    href="/catalog"
                    className={buttonVariants({ variant: "outline" })}
                    aria-current={path.startsWith("/catalog") ? "page" : undefined}
                    onClick={() => setOpen(false)}
                  >
                    {t("catalog")}
                  </Link>
                  <LanguageSwitcher />
                  <ThemeSwitcher initialTheme={initialTheme} />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}

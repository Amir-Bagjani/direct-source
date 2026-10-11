"use client";
import { useRef, useLayoutEffect } from "react";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/shared/ui/alert/alert";
import { Button } from "@/shared/ui/button/button";
import { Spinner } from "@/shared/ui/spinner/spinner";
import type { PrivateQueryRegionProps } from "./private-query-region.types";
export function PrivateQueryRegion({ children, masked, error, retry }: PrivateQueryRegionProps) {
  const t = useTranslations("common"),
    focused = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!masked && focused.current?.isConnected && document.activeElement === document.body)
      focused.current.focus({ preventScroll: true });
  }, [masked]);
  return (
    <div className="relative">
      <div
        inert={masked}
        aria-hidden={masked}
        className={`flex flex-col gap-6${masked ? " invisible" : ""}`}
        onFocusCapture={(event) => {
          if (event.target instanceof HTMLElement) focused.current = event.target;
        }}
      >
        {children}
      </div>
      {masked && (
        <div className="absolute inset-0 bg-background">
          <div className="sticky top-4 flex flex-col gap-4">
            {error ? (
              <>
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
                <Button className="self-start" onClick={retry}>
                  {t("retry")}
                </Button>
              </>
            ) : (
              <p role="status" className="flex items-center gap-2">
                <Spinner aria-hidden="true" />
                {t("loading")}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

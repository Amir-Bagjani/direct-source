"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/shared/ui/cn";
import { Loader2Icon } from "lucide-react";

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  const t = useTranslations("common");
  return (
    <Loader2Icon
      data-slot="spinner"
      role="status"
      aria-label={t("loading")}
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };

"use client";

import { createContext, useCallback, useState, type ComponentProps } from "react";
import { cn } from "@/shared/ui/cn";

export const PortalContainerContext = createContext<HTMLElement | null | undefined>(undefined);

// Keep private overlays inside the same DOM boundary that masks their owner.
export function PortalContainer({ children, ref, className, ...props }: ComponentProps<"div">) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const attach = useCallback(
    (element: HTMLDivElement | null) => {
      setContainer(element);
      if (typeof ref === "function") return ref(element);
      if (ref) ref.current = element;
    },
    [ref],
  );
  return (
    <PortalContainerContext value={container}>
      <div
        {...props}
        ref={attach}
        className={cn("inert:invisible! inert:**:invisible! inert:**:transition-none!", className)}
      >
        {children}
      </div>
    </PortalContainerContext>
  );
}

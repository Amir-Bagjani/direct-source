"use client";
import { DirectionProvider as BaseDirectionProvider } from "@base-ui/react/direction-provider";
import type { ComponentProps } from "react";

export function DirectionProvider(props: ComponentProps<typeof BaseDirectionProvider>) {
  return <BaseDirectionProvider {...props} />;
}

import type { ReactNode } from "react";
export interface PrivateQueryRegionProps {
  children: ReactNode;
  masked: boolean;
  error: string | undefined;
  retry: () => void;
}

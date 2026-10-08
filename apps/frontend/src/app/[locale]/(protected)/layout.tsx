import type { ReactNode } from "react";
import { ProtectedSessionBoundary } from "@/features/accounts/components/protected-session-boundary/protected-session-boundary";

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return <ProtectedSessionBoundary>{children}</ProtectedSessionBoundary>;
}

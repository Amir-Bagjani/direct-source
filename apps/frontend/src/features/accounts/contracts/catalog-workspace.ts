"use client";
import { useProtectedSession } from "../components/protected-session-boundary/protected-session-context";

// Catalogue requests follow the same live session decision as the account form hosts.
export function useCatalogWorkspaceSession() {
  const { user, authorized } = useProtectedSession();
  return { scope: user.id, authorized };
}

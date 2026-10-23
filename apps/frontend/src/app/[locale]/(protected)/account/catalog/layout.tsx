import type { ReactNode } from "react";
import { AccountShell } from "@/features/accounts/components/account-shell/account-shell";

export default function CatalogLayout({ children }: { children: ReactNode }) {
  return <AccountShell>{children}</AccountShell>;
}

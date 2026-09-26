import "server-only";
import { headers } from "next/headers";
import { redirect } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { ApiError } from "@/shared/api/unwrap";
import { sessionId } from "./session-cookie.server";
import { currentUser } from "./session.server";

export async function requireAccount(locale: AppLocale) {
  const id = await sessionId((await headers()).get("cookie"));
  if (!id) return redirect({ href: "/login", locale });
  try {
    await currentUser(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect({ href: "/login", locale });
    throw new Error("auth_unavailable");
  }
}

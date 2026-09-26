"use client";
import { z } from "zod";
import { signIn } from "next-auth/react";
import { bffRequest } from "@/shared/api/browser-client";
import { registeredUserSchema } from "../schemas/registration.schema";
import { loginSchema } from "../schemas/login.schema";
import type { LoginInput } from "../schemas/login.schema";

export function readSession(signal?: AbortSignal) {
  return bffRequest("/api/bff/auth/session", registeredUserSchema, signal ? { signal } : {});
}
export async function login(input: LoginInput, locale: string) {
  const values = loginSchema.parse(input);
  const result = await signIn("credentials", {
    ...values,
    redirect: false,
    callbackUrl: `/${locale}/account`,
  });
  if (!result?.ok || result.error) throw new Error("login_failed");
  await readSession();
}
export function logout() {
  return bffRequest("/api/bff/auth/logout", z.undefined(), { method: "POST" });
}

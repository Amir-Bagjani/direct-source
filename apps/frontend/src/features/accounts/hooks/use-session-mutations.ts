"use client";
import { useMutation } from "@tanstack/react-query";
import { login, logout } from "../api/session.api";
import type { LoginInput } from "../schemas/login.schema";
import { accountKeys } from "../queries/accounts.keys";
export function useLogin(readInput: () => LoginInput, locale: string) {
  return useMutation({
    mutationKey: accountKeys.login(),
    mutationFn: () => login(readInput(), locale),
    retry: false,
    gcTime: 0,
    networkMode: "always",
  });
}
export function useLogout() {
  return useMutation({
    mutationKey: accountKeys.logout(),
    mutationFn: logout,
    retry: false,
    gcTime: 0,
    networkMode: "always",
  });
}

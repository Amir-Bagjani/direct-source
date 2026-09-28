"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { accountKeys } from "../queries/accounts.keys";
export function useOnboardingMutation(userId: string, execute: () => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: accountKeys.onboardingMutation(),
    mutationFn: async () => {
      await execute();
    },
    retry: false,
    gcTime: 0,
    networkMode: "always",
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: accountKeys.business(userId) }),
        client.invalidateQueries({ queryKey: accountKeys.onboarding(userId) }),
      ]),
  });
}

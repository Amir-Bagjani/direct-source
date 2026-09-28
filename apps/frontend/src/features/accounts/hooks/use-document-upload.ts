"use client";
import { useMutation } from "@tanstack/react-query";
import { uploadBusinessFile } from "../api/onboarding.api";
import { accountKeys } from "../queries/accounts.keys";
export function useDocumentUpload(
  read: () => Parameters<typeof uploadBusinessFile>,
  onUploaded: (id: string) => void,
) {
  return useMutation({
    mutationKey: accountKeys.onboardingMutation(),
    mutationFn: async () => {
      const result = await uploadBusinessFile(...read());
      onUploaded(result.id);
    },
    retry: false,
    gcTime: 0,
    networkMode: "always",
  });
}

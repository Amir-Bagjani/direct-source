"use client";

import { accountKeys } from "../queries/accounts.keys";
import { useMutation } from "@tanstack/react-query";
import { submitRegistration } from "../api/registration.api";
import type { RegistrationInput } from "../schemas/registration.schema";

export function useRegistration(readInput: () => RegistrationInput, onSuccess: () => void) {
  return useMutation({
    mutationKey: accountKeys.register(),
    // Credentials stay in the form/transport, never in MutationCache.variables.
    mutationFn: () => submitRegistration(readInput()),
    retry: false,
    gcTime: 0,
    onSuccess,
  });
}

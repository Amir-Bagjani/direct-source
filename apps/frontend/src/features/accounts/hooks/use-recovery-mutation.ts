"use client";
import { accountKeys } from "../queries/accounts.keys";
import { useMutation } from "@tanstack/react-query";
import type { z } from "zod";
import { submitRecovery } from "../api/recovery.api";
import type { RecoveryAction, recoveryInputs } from "../schemas/recovery.schema";
// Form/fragment secrets are read at submission time, never stored in mutation variables.
export function useRecoveryMutation<A extends RecoveryAction>(
  action: A,
  readInput: () => z.input<(typeof recoveryInputs)[A]>,
) {
  return useMutation({
    mutationKey: accountKeys.recovery(action),
    mutationFn: () => submitRecovery(action, readInput()),
    retry: false,
    gcTime: 0,
    networkMode: "always",
  });
}

"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { writeOnboarding } from "../api/onboarding.api";
import { businessDraftSchema } from "../schemas/business.schema";
import { createBusiness } from "../api/business.api";
import { accountKeys } from "../queries/accounts.keys";
import type { BusinessInput, BusinessDraft } from "../schemas/business.schema";
export function useCreateBusiness(
  userId: string,
  readInput: () => BusinessInput,
  businessId?: string,
  readLogo: () => string | null = () => null,
  prepareRevision?: (input: BusinessDraft) => Promise<void>,
) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: accountKeys.createBusiness(),
    mutationFn: async () => {
      if (prepareRevision)
        await prepareRevision(businessDraftSchema.parse({ ...readInput(), logo: readLogo() }));
      else if (businessId)
        await writeOnboarding(
          "draft",
          businessId,
          businessDraftSchema.parse({ ...readInput(), logo: readLogo() }),
        );
      else await createBusiness(readInput());
    },
    retry: false,
    gcTime: 0,
    networkMode: "always",
    onSuccess: () => client.invalidateQueries({ queryKey: accountKeys.business(userId) }),
  });
}

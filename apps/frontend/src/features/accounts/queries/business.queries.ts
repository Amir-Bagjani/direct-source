"use client";
import { queryOptions } from "@tanstack/react-query";
import { readBusiness } from "../api/business.api";
import { accountKeys } from "./accounts.keys";
export function businessOptions(userId: string) {
  return queryOptions({
    queryKey: accountKeys.business(userId),
    queryFn: ({ signal }) => readBusiness(signal),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchInterval: 15_000,
  });
}

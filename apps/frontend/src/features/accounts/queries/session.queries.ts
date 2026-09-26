"use client";
import { queryOptions } from "@tanstack/react-query";
import { readSession } from "../api/session.api";
import { accountKeys } from "./accounts.keys";

export function sessionOptions(epoch: number) {
  return queryOptions({
    queryKey: accountKeys.session(epoch),
    queryFn: ({ signal }) => readSession(signal),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchInterval: 15_000,
  });
}

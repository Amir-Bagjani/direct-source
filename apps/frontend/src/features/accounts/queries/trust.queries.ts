"use client";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { readTrust } from "../api/trust.api";
import { accountKeys } from "./accounts.keys";
import type { TrustAction } from "../schemas/trust.schema";
export function trustOptions<T>(
  userId: string,
  action: TrustAction,
  schema: z.ZodType<T>,
  id = "",
  page = 1,
  kind = "suspension",
) {
  return queryOptions({
    queryKey: accountKeys.trust(userId, action, id, page, kind),
    queryFn: ({ signal }) => readTrust(action, schema, signal, id, page, kind),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchInterval: 15000,
  });
}

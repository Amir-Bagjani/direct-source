"use client";
import { queryOptions } from "@tanstack/react-query";
import { readPolicy, readQueue, readSections, readBusinessDetail } from "../api/onboarding.api";
import { accountKeys } from "./accounts.keys";
const privateOptions = { staleTime: 0, gcTime: 0, retry: false, refetchInterval: 15000 } as const;
export const policyOptions = () =>
  queryOptions({
    queryKey: accountKeys.documentPolicy(),
    queryFn: ({ signal }) => readPolicy(signal),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
export const sectionsOptions = (userId: string, id: string) =>
  queryOptions({
    ...privateOptions,
    queryKey: accountKeys.sections(userId, id),
    queryFn: ({ signal }) => readSections(id, signal),
  });
export const businessDetailOptions = (userId: string, id: string) =>
  queryOptions({
    ...privateOptions,
    queryKey: accountKeys.businessDetail(userId, id),
    queryFn: ({ signal }) => readBusinessDetail(id, signal),
  });
export const reviewQueueOptions = (userId: string, page: number) =>
  queryOptions({
    ...privateOptions,
    queryKey: accountKeys.reviewQueue(userId, page),
    queryFn: ({ signal }) => readQueue(page, signal),
  });

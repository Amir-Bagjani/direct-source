"use client";
import { queryOptions } from "@tanstack/react-query";
import {
  readEditor,
  readOperatorDashboard,
  readReviewDetail,
  readRevision,
  readStudio,
  readStudioAccess,
  readProductPreview,
} from "../api/catalog-management.api";
import { catalogKeys } from "./catalog.keys";

const privateQuery = { staleTime: 0, gcTime: 0, retry: false } as const;

export const studioAccessOptions = (scope: string) =>
  queryOptions({
    queryKey: catalogKeys.studioAccess(scope),
    queryFn: ({ signal }) => readStudioAccess(signal),
    ...privateQuery,
  });

export const studioOptions = (scope: string) =>
  queryOptions({
    queryKey: catalogKeys.studio(scope),
    queryFn: ({ signal }) => readStudio(signal),
    ...privateQuery,
  });

export const editorOptions = (scope: string, id: string) =>
  queryOptions({
    queryKey: catalogKeys.editor(scope, id),
    queryFn: ({ signal }) => readEditor(id, signal),
    ...privateQuery,
  });

export const operatorOptions = (scope: string) =>
  queryOptions({
    queryKey: catalogKeys.operator(scope),
    queryFn: ({ signal }) => readOperatorDashboard(signal),
    ...privateQuery,
  });

export const reviewDetailOptions = (scope: string, id: string) =>
  queryOptions({
    queryKey: catalogKeys.operatorReview(scope, id),
    queryFn: ({ signal }) => readReviewDetail(id, signal),
    ...privateQuery,
  });

export const revisionOptions = (scope: string, id: string) =>
  queryOptions({
    queryKey: catalogKeys.operatorRevision(scope, id),
    queryFn: ({ signal }) => readRevision(id, signal),
    ...privateQuery,
  });

export const productPreviewOptions = (scope: string, id: string) =>
  queryOptions({
    queryKey: catalogKeys.preview(scope, id),
    queryFn: ({ signal }) => readProductPreview(id, signal),
    ...privateQuery,
  });

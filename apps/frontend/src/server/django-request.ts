import "server-only";
import type { z } from "zod";
import { ApiError, unwrap } from "@/shared/api/unwrap";
import { authConfig } from "./auth/config";

// Server callers provide fixed API paths; never accept a browser-supplied destination.
export async function djangoResponse(
  path: `/api/v1/${string}`,
  options: {
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    access?: string;
    body?: unknown;
    form?: FormData;
  },
) {
  return fetch(`${authConfig().backend}${path}`, {
    method: options.method,
    headers: {
      ...(!options.form ? { "Content-Type": "application/json" } : {}),
      ...(options.access ? { Authorization: `Bearer ${options.access}` } : {}),
    },
    ...(options.form ? { body: options.form } : {}),
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(options.form ? 30_000 : 8000),
  });
}

export async function djangoRequest<T>(
  path: `/api/v1/${string}`,
  schema: z.ZodType<T>,
  options: Parameters<typeof djangoResponse>[1],
) {
  const response = await djangoResponse(path, options);
  try {
    if (response.status === 202) return schema.parse(undefined);
    return await unwrap(response, schema);
  } catch (error) {
    if (error instanceof ApiError) throw new ApiError(error.status, "auth_request_failed");
    throw new Error("auth_upstream_invalid");
  }
}

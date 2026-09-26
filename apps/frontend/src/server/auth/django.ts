import "server-only";
import { z } from "zod";
import { ApiError, unwrap } from "@/shared/api/unwrap";
import { authConfig } from "./config";

type AuthEndpoint =
  | "login"
  | "refresh"
  | "me"
  | "logout"
  | "email"
  | "email/request"
  | "email/confirm"
  | "password/request"
  | "password/reset";
export async function djangoAuth<T>(
  endpoint: AuthEndpoint,
  schema: z.ZodType<T>,
  options: { access?: string; body?: unknown } = {},
) {
  const response = await fetch(`${authConfig().backend}/api/v1/auth/${endpoint}/`, {
    method: endpoint === "me" ? "GET" : endpoint === "email" ? "PUT" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.access ? { Authorization: `Bearer ${options.access}` } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  });
  try {
    if (response.status === 202) return schema.parse(undefined);
    return await unwrap(response, schema);
  } catch (error) {
    if (error instanceof ApiError) throw new ApiError(error.status, "auth_request_failed");
    throw new Error("auth_upstream_invalid");
  }
}

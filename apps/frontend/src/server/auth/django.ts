import "server-only";
import type { z } from "zod";
import { djangoRequest } from "../django-request";

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
  return djangoRequest(`/api/v1/auth/${endpoint}/`, schema, {
    ...options,
    method: endpoint === "me" ? "GET" : endpoint === "email" ? "PUT" : "POST",
  });
}

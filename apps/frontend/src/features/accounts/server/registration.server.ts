import "server-only";
import { apiConfig } from "@/server/api-config";
import { readJsonBody } from "@/server/read-body";
import { randomUUID } from "node:crypto";
import { isSameOriginMutation } from "@/server/request-policy";
import { ApiError, unwrap } from "@/shared/api/unwrap";
import { registeredUserSchema, registrationSchema } from "../schemas/registration.schema";

export async function registerAccount(request: Request) {
  const requestId = randomUUID();
  const headers = { "Cache-Control": "no-store", "X-Request-ID": requestId };
  const error = (status: number, code: string) =>
    Response.json({ code, message: code, request_id: requestId }, { status, headers });

  // Never derive trusted origins or upstream destinations from forwarded/browser headers.
  let origin: string;
  let upstream: URL;
  try {
    const config = apiConfig();
    origin = config.origin;
    upstream = new URL("/api/v1/auth/register/", config.backend);
  } catch {
    return error(503, "registration_unavailable");
  }
  if (!isSameOriginMutation(request, origin)) return error(403, "origin_rejected");
  let input: unknown;
  try {
    input = await readJsonBody(request);
  } catch (cause) {
    return cause instanceof ApiError
      ? error(cause.status, cause.code)
      : error(400, "invalid_input");
  }
  const parsed = registrationSchema.safeParse(input);
  if (!parsed.success) return error(400, "invalid_input");

  try {
    const response = await fetch(upstream, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Request-ID": requestId,
      },
      body: JSON.stringify(parsed.data),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    await unwrap(response, registeredUserSchema);
    if (response.status !== 201) return error(502, "registration_unavailable");
    return Response.json({ created: true }, { status: 201, headers });
  } catch (cause) {
    if (cause instanceof ApiError) {
      if (cause.status === 429) return error(429, "registration_throttled");
      if (cause.status === 400) return error(400, "registration_rejected");
    }
    // A timeout can follow a committed write. Never retry or claim nothing was created.
    return error(502, "registration_unavailable");
  }
}

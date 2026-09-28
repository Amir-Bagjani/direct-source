import "server-only";
import { z } from "zod";
import { authConfig } from "@/server/auth/config";
import { djangoRequest } from "@/server/django-request";
import { readJsonBody } from "@/server/read-body";
import { isSameOriginMutation } from "@/server/request-policy";
import { ApiError } from "@/shared/api/unwrap";
import { sessionId } from "./session-cookie.server";
import { withAccountRead, withAccountMutation } from "./session.server";
import {
  businessInputSchema,
  businessSchema,
  businessListSchema,
} from "../schemas/business.schema";

export async function businessBff(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const fail = (status: number, code: string) =>
    Response.json({ code, message: code, request_id: crypto.randomUUID() }, { status, headers });
  try {
    if (!["GET", "POST"].includes(request.method)) return fail(405, "method_rejected");
    if (!isSameOriginMutation(request, authConfig().origin)) return fail(403, "origin_rejected");
    const id = await sessionId(request.headers.get("cookie"));
    if (!id) return fail(401, "session_required");
    if (request.method === "GET") {
      const page = await withAccountRead(id, (access) =>
        djangoRequest("/api/v1/businesses/", businessListSchema, { method: "GET", access }),
      );
      return Response.json(page.results[0] ?? null, { headers });
    }
    const body = businessInputSchema.parse(await readJsonBody(request, 16_384));
    await withAccountMutation(id, (access) =>
      djangoRequest("/api/v1/businesses/", businessSchema, { method: "POST", access, body }),
    );
    return Response.json({ created: true }, { status: 201, headers });
  } catch (error) {
    if (error instanceof z.ZodError) return fail(400, "invalid_input");
    return fail(
      error instanceof ApiError ? error.status : 503,
      error instanceof ApiError && error.status === 409
        ? "business_exists"
        : "business_unavailable",
    );
  }
}

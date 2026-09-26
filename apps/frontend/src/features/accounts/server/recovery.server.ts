import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authConfig } from "@/server/auth/config";
import { djangoAuth } from "@/server/auth/django";
import { readJsonBody } from "@/server/read-body";
import { isSameOriginMutation } from "@/server/request-policy";
import { ApiError } from "@/shared/api/unwrap";
import { sessionId, clearSessionCookie } from "./session-cookie.server";
import { withAccountMutation } from "./session.server";
import { recoveryInputs } from "../schemas/recovery.schema";

export async function recoveryBff(request: Request, action: string) {
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  const fail = (status: number, code: string) =>
    NextResponse.json({ code, message: code, request_id: randomUUID() }, { status, headers });
  try {
    if (!Object.hasOwn(recoveryInputs, action)) return fail(404, "not_found");
    if (request.method !== (action === "email" ? "PUT" : "POST"))
      return fail(405, "method_rejected");
    if (!isSameOriginMutation(request, authConfig().origin)) return fail(403, "origin_rejected");
    const input = await readJsonBody(request);
    if (action === "email" || action === "request-verification") {
      const id = await sessionId(request.headers.get("cookie"));
      if (!id) return fail(401, "session_required");
      const body =
        action === "email"
          ? recoveryInputs.email.parse(input)
          : recoveryInputs["request-verification"].parse(input);
      await withAccountMutation(id, (access) =>
        djangoAuth(action === "email" ? "email" : "email/request", z.undefined(), { access, body }),
      );
    } else if (action === "request-reset") {
      await djangoAuth("password/request", z.undefined(), {
        body: recoveryInputs["request-reset"].parse(input),
      });
    } else if (action === "confirm") {
      await djangoAuth("email/confirm", z.undefined(), {
        body: recoveryInputs.confirm.parse(input),
      });
    } else if (action === "reset") {
      await djangoAuth("password/reset", z.undefined(), {
        body: recoveryInputs.reset.parse(input),
      });
    }
    const response = NextResponse.json(
      { accepted: true },
      { status: action.startsWith("request-") ? 202 : 200, headers },
    );
    if (action === "reset") clearSessionCookie(response);
    return response;
  } catch (error) {
    if (error instanceof z.ZodError) return fail(400, "invalid_input");
    if (error instanceof ApiError)
      return fail(
        error.status,
        ["invalid_input", "unsupported_media_type"].includes(error.code)
          ? error.code
          : error.status === 429
            ? "recovery_throttled"
            : error.status === 401
              ? "session_required"
              : error.status < 500
                ? "recovery_rejected"
                : "recovery_uncertain",
      );
    return fail(503, "recovery_uncertain");
  }
}

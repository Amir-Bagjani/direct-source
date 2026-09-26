import "server-only";
import { NextResponse } from "next/server";
import { authConfig } from "@/server/auth/config";
import { isSameOriginMutation } from "@/server/request-policy";
import { ApiError } from "@/shared/api/unwrap";
import { sessionId, clearSessionCookie } from "./session-cookie.server";
import { closeSession, currentUser } from "./session.server";

export async function sessionBff(request: Request, logout = false) {
  const headers = { "Cache-Control": "no-store" };
  const fail = (status: number, code: string) =>
    NextResponse.json(
      { code, message: code, request_id: crypto.randomUUID() },
      { status, headers },
    );
  try {
    if (!isSameOriginMutation(request, authConfig().origin)) return fail(403, "origin_rejected");
    const id = await sessionId(request.headers.get("cookie"));
    if (logout) {
      if (id) await closeSession(id);
      const response = new NextResponse(null, { status: 204, headers });
      clearSessionCookie(response);
      return response;
    }
    if (!id) return fail(401, "session_required");
    return NextResponse.json(await currentUser(id), { headers });
  } catch (error) {
    return fail(
      error instanceof ApiError ? error.status : 503,
      logout
        ? "logout_uncertain"
        : error instanceof ApiError && error.status === 401
          ? "session_required"
          : "auth_unavailable",
    );
  }
}

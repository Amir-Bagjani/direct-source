import "server-only";
import { readBodyText } from "@/server/read-body";
import { ApiError } from "@/shared/api/unwrap";
import { NextRequest } from "next/server";
import NextAuth from "next-auth";

import { authConfig } from "@/server/auth/config";
import { isSameOriginMutation } from "@/server/request-policy";
import { nextAuthOptions } from "./nextauth.server";

export async function handleNextAuth(
  request: NextRequest,
  context: { params: Promise<{ nextauth: string[] }> },
) {
  const { nextauth } = await context.params;
  const action = nextauth.join("/");
  // No alternate signout path may skip Django revocation.
  if (
    !(request.method === "GET" && ["csrf", "providers", "session"].includes(action)) &&
    !(request.method === "POST" && action === "callback/credentials")
  )
    return new Response(null, { status: 405 });
  try {
    if (!isSameOriginMutation(request, authConfig().origin))
      return new Response(null, { status: 403 });
    if (request.method === "POST") {
      const body = await readBodyText(request);
      request = new NextRequest(request.url, { method: "POST", headers: request.headers, body });
    }
    const response: Response = await NextAuth(nextAuthOptions())(request, context);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (error instanceof ApiError && error.status === 413)
      return new Response(null, { status: 413 });
    return Response.json(
      { error: "auth_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

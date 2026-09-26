import "server-only";
import { getToken } from "next-auth/jwt";
import { NextRequest, type NextResponse } from "next/server";
import { z } from "zod";
import { authConfig } from "@/server/auth/config";

export async function sessionId(cookie: string | null) {
  if (!cookie) return null;
  const config = authConfig();
  // Browser Authorization headers are never accepted as web session credentials.
  const req = new NextRequest(config.origin, { headers: { cookie } });
  const token = await getToken({
    req,
    secret: config.secret,
    cookieName: config.cookieName,
    secureCookie: config.secure,
  });
  const id = z.uuid().safeParse(token?.sub);
  return id.success ? id.data : null;
}

export function clearSessionCookie(response: NextResponse) {
  const config = authConfig();
  response.cookies.set(config.cookieName, "", {
    httpOnly: true,
    secure: config.secure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

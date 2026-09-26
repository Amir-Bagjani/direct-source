import "server-only";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { authConfig } from "@/server/auth/config";
import { loginSchema } from "../schemas/login.schema";
import { openSession } from "./session.server";

export function nextAuthOptions(): NextAuthOptions {
  const config = authConfig();
  return {
    secret: config.secret,
    session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
    cookies: {
      sessionToken: {
        name: config.cookieName,
        options: { httpOnly: true, sameSite: "lax", path: "/", secure: config.secure },
      },
    },
    providers: [
      CredentialsProvider({
        credentials: { mobile: { type: "tel" }, password: { type: "password" } },
        async authorize(raw) {
          const parsed = loginSchema.safeParse(raw);
          if (!parsed.success) return null;
          try {
            return { id: await openSession(parsed.data.mobile, parsed.data.password) };
          } catch {
            return null;
          }
        },
      }),
    ],
    callbacks: {
      jwt({ token, user }) {
        return user ? { sub: user.id } : token;
      },
      // Session inspection is served by the authoritative BFF, not cookie claims.
      session() {
        return { expires: new Date(0).toISOString() };
      },
      redirect({ url }) {
        try {
          const target = new URL(url, config.origin);
          if (
            target.origin === config.origin &&
            /^\/(fa|en)\/account$/.test(target.pathname) &&
            !target.search &&
            !target.hash
          )
            return target.href;
        } catch {
          /* fixed safe fallback */
        }
        return `${config.origin}/fa/account`;
      },
    },
    // Never log provider errors, request metadata, credentials or JWTs.
    logger: { error() {}, warn() {}, debug() {} },
  };
}

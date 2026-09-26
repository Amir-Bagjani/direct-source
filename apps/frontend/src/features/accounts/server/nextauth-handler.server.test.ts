import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { handleNextAuth } from "./nextauth-handler.server";
vi.mock("server-only", () => ({}));
beforeEach(() => {
  vi.stubEnv("NEXTAUTH_SECRET", randomBytes(32).toString("hex"));
  vi.stubEnv("SESSION_VAULT_KEY", randomBytes(32).toString("hex"));
  vi.stubEnv("FRONTEND_DATABASE_URL", "postgresql://localhost/test");
  vi.stubEnv("NEXTAUTH_URL", "https://market.example");
  vi.stubEnv("DJANGO_API_URL", "http://localhost:8000");
});
afterEach(() => vi.unstubAllEnvs());
function context(action: string) {
  return { params: Promise.resolve({ nextauth: action.split("/") }) };
}
it.each(["signout", "signin", "callback/other", "unknown"])(
  "does not expose an alternate %s path",
  async (action) => {
    const response = await handleNextAuth(
      new NextRequest(`https://market.example/api/auth/${action}`, { method: "POST" }),
      context(action),
    );
    expect(response.status).toBe(405);
  },
);
it("rejects a forged origin even when forwarded headers claim the trusted host", async () => {
  const response = await handleNextAuth(
    new NextRequest("https://market.example/api/auth/callback/credentials", {
      method: "POST",
      headers: { origin: "https://foreign.example", "x-forwarded-host": "market.example" },
    }),
    context("callback/credentials"),
  );
  expect(response.status).toBe(403);
});
it("bounds streamed credential bodies without trusting content-length", async () => {
  const response = await handleNextAuth(
    new NextRequest("https://market.example/api/auth/callback/credentials", {
      method: "POST",
      headers: { origin: "https://market.example", "content-length": "1" },
      body: "x".repeat(8193),
    }),
    context("callback/credentials"),
  );
  expect(response.status).toBe(413);
});

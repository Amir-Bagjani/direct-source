import { randomBytes, randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { sessionBff } from "./session-bff.server";
import { nextAuthOptions } from "./nextauth.server";
import { ApiError } from "@/shared/api/unwrap";
vi.mock("server-only", () => ({}));
const upstream = vi.hoisted(() => ({
  currentUser: vi.fn(),
  closeSession: vi.fn(),
  openSession: vi.fn(),
}));
vi.mock("./session.server", () => upstream);
const id = randomUUID();
beforeEach(() => {
  vi.stubEnv("NEXTAUTH_SECRET", randomBytes(32).toString("hex"));
  vi.stubEnv("SESSION_VAULT_KEY", randomBytes(32).toString("hex"));
  vi.stubEnv("FRONTEND_DATABASE_URL", "postgresql://localhost/test");
  vi.stubEnv("NEXTAUTH_URL", "https://market.example");
  vi.stubEnv("DJANGO_API_URL", "http://localhost:8000");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});
async function cookie() {
  return `__Secure-ds.session=${await encode({ token: { sub: id }, secret: process.env.NEXTAUTH_SECRET!, maxAge: 300 })}`;
}
it("requires a valid cookie and ignores browser Bearer authentication", async () => {
  for (const headers of [
    {},
    { Cookie: "__Secure-ds.session=forged" },
    { Authorization: `Bearer ${await cookie()}` },
  ]) {
    expect(
      (await sessionBff(new Request("https://market.example/api/bff/auth/session", { headers })))
        .status,
    ).toBe(401);
  }
  expect(upstream.currentUser).not.toHaveBeenCalled();
});
it("uses the encrypted cookie's opaque ID only and marks private responses no-store", async () => {
  upstream.currentUser.mockResolvedValue({ id: "public-user-id" });
  const response = await sessionBff(
    new Request("https://market.example/api/bff/auth/session", {
      headers: { Cookie: await cookie() },
    }),
  );
  expect(upstream.currentUser).toHaveBeenCalledWith(id);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect((await response.text()).includes(id)).toBe(false);
});
it("rejects missing or foreign origins before revocation", async () => {
  for (const origin of ["", "null", "https://foreign.example"]) {
    expect(
      (
        await sessionBff(
          new Request("https://market.example/api/bff/auth/logout", {
            method: "POST",
            headers: { Cookie: await cookie(), Origin: origin },
          }),
          true,
        )
      ).status,
    ).toBe(403);
  }
  expect(upstream.closeSession).not.toHaveBeenCalled();
});
it("expires HttpOnly Secure SameSite cookies only after confirmed logout", async () => {
  const request = () =>
    new Request("https://market.example/api/bff/auth/logout", {
      method: "POST",
      headers: { Origin: "https://market.example" },
    });
  const successRequest = request();
  successRequest.headers.set("cookie", await cookie());
  const success = await sessionBff(successRequest, true);
  expect(success.status).toBe(204);
  expect(upstream.closeSession).toHaveBeenCalledWith(id);
  const attributes = success.headers.get("set-cookie")!.split("; ");
  expect(attributes).toEqual(
    expect.arrayContaining([
      "__Secure-ds.session=",
      "Max-Age=0",
      "HttpOnly",
      "Secure",
      "SameSite=lax",
      "Path=/",
    ]),
  );
  upstream.closeSession.mockRejectedValue(new ApiError(503, "private-error"));
  const failedRequest = request();
  failedRequest.headers.set("cookie", await cookie());
  const failed = await sessionBff(failedRequest, true);
  expect(failed.status).toBe(503);
  expect(failed.headers.has("set-cookie")).toBe(false);
  expect(await failed.text()).not.toContain("private-error");
});
it("only redirects credentials callbacks to a fixed local account route", async () => {
  const redirect = nextAuthOptions().callbacks!.redirect!;
  for (const url of [
    "https://foreign.example/en/account",
    "//foreign.example",
    "/en/account?next=evil",
    "/en/account#private",
    "/en/other",
  ]) {
    expect(await redirect({ url, baseUrl: "https://forged.example" })).toBe(
      "https://market.example/fa/account",
    );
  }
  expect(await redirect({ url: "/en/account", baseUrl: "https://forged.example" })).toBe(
    "https://market.example/en/account",
  );
});

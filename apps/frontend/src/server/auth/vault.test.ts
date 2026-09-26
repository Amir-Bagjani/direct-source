import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { encryptTokens, decryptTokens } from "./vault";
import { authConfig } from "./config";
vi.mock("server-only", () => ({}));
beforeEach(() => {
  vi.stubEnv("NEXTAUTH_SECRET", randomBytes(32).toString("hex"));
  vi.stubEnv("SESSION_VAULT_KEY", randomBytes(32).toString("hex"));
  vi.stubEnv("FRONTEND_DATABASE_URL", "postgresql://localhost/test");
  vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000");
  vi.stubEnv("DJANGO_API_URL", "http://localhost:8000");
});
afterEach(() => vi.unstubAllEnvs());
it("encrypts with fresh nonces, authenticates ciphertext and binds it to the session ID", () => {
  const id = randomUUID();
  const pair = { access: "test-access", refresh: "test-refresh" };
  const encrypted = encryptTokens(id, pair);
  expect(encrypted).not.toBe(encryptTokens(id, pair));
  expect(encrypted.includes(pair.refresh)).toBe(false);
  expect(decryptTokens(id, encrypted)).toEqual(pair);
  expect(() => decryptTokens(randomUUID(), encrypted)).toThrow();
  const tampered = Buffer.from(encrypted, "base64url");
  tampered[30] = tampered[30]! ^ 1;
  expect(() => decryptTokens(id, tampered.toString("base64url"))).toThrow();
  vi.stubEnv("SESSION_VAULT_KEY", randomBytes(32).toString("hex"));
  expect(() => decryptTokens(id, encrypted)).toThrow();
});
it("selects Secure cookies for HTTPS and refuses non-local HTTP", () => {
  expect(authConfig().cookieName).toBe("ds.session");
  vi.stubEnv("NEXTAUTH_URL", "https://market.example");
  expect(authConfig()).toMatchObject({ cookieName: "__Secure-ds.session", secure: true });
  vi.stubEnv("NEXTAUTH_URL", "http://market.example");
  expect(() => authConfig()).toThrow();
});
it.each(["NEXTAUTH_SECRET", "SESSION_VAULT_KEY", "FRONTEND_DATABASE_URL"])(
  "fails closed without %s",
  (name) => {
    vi.stubEnv(name, "");
    expect(() => authConfig()).toThrow();
  },
);

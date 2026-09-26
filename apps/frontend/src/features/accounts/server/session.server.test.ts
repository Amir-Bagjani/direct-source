import { randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/unwrap";
import { currentUser, closeSession, withAccountMutation } from "./session.server";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  row: { encrypted_tokens: "encrypted", state: "ready", closing: false, expires_at: new Date() },
  pair: { access: "", refresh: "" },
  query: vi.fn(async (_sql: string, _args?: unknown[]) => ({})),
  upstream: vi.fn(),
}));
vi.mock("@/server/auth/django", () => ({ djangoAuth: state.upstream }));
vi.mock("@/server/auth/vault", async () => {
  const { z } = await import("zod");
  return {
    tokensSchema: z.object({ access: z.string(), refresh: z.string() }),
    createVaultSession: vi.fn(),
    decryptTokens: () => state.pair,
    encryptTokens: () => "next-encrypted",
    withVaultSession: async (
      _id: string,
      work: (client: { query: typeof state.query }, row: typeof state.row) => Promise<unknown>,
    ) => work({ query: state.query }, state.row),
  };
});
const id = randomUUID();
const sid = randomUUID();
const userId = randomUUID();
function pair(expiry: number) {
  const jwt = (exp: number) =>
    `header.${Buffer.from(JSON.stringify({ exp, sid, user_id: userId })).toString("base64url")}.test`;
  return { access: jwt(expiry), refresh: jwt(Math.floor(Date.now() / 1000) + 3600) };
}
beforeEach(() => {
  vi.resetAllMocks();
  state.row = {
    encrypted_tokens: "encrypted",
    state: "ready",
    closing: false,
    expires_at: new Date(Date.now() + 3600000),
  };
  state.pair = pair(Math.floor(Date.now() / 1000) + 300);
});
it("authorizes with Django on every read, never from cookie or token claims", async () => {
  state.upstream.mockResolvedValue({ id: userId });
  await currentUser(id);
  await currentUser(id);
  expect(state.upstream.mock.calls.map((call) => call[0])).toEqual(["me", "me"]);
});
it("commits refreshing before HTTP, stores the replacement and retries me only once", async () => {
  state.upstream.mockRejectedValueOnce(new ApiError(401, "expired"));
  state.upstream.mockImplementationOnce(async () => {
    expect(state.query.mock.calls[0]![0]).toContain("state='refreshing'");
    return pair(Math.floor(Date.now() / 1000) + 300);
  });
  state.upstream.mockResolvedValueOnce({ id: userId });
  await currentUser(id);
  expect(state.upstream.mock.calls.map((call) => call[0])).toEqual(["me", "refresh", "me"]);
  expect(state.query.mock.calls[1]![0]).toContain("state='ready'");
});
it("never restores ready or replays refresh after an uncertain transport outcome", async () => {
  state.pair = pair(1);
  state.upstream.mockRejectedValue(new TypeError("network error"));
  await expect(currentUser(id)).rejects.toMatchObject({ status: 503 });
  expect(state.upstream).toHaveBeenCalledTimes(1);
  expect(
    state.query.mock.calls.map((call) => call[0]).some((sql) => sql.includes("state='ready'")),
  ).toBe(false);
  state.row.state = "refreshing";
  await expect(currentUser(id)).rejects.toMatchObject({ status: 401 });
  expect(state.upstream).toHaveBeenCalledTimes(1);
});
it.each(["closing", "expired", "refreshing"])(
  "refuses %s sessions before contacting Django",
  async (reason) => {
    if (reason === "closing") state.row.closing = true;
    if (reason === "expired") state.row.expires_at = new Date(0);
    if (reason === "refreshing") state.row.state = "refreshing";
    await expect(currentUser(id)).rejects.toMatchObject({ status: 401 });
    expect(state.upstream).not.toHaveBeenCalled();
  },
);
it("blocks local access before logout and retains retry state when revocation is uncertain", async () => {
  state.upstream.mockImplementation(async () => {
    expect(state.query.mock.calls[0]![0]).toContain("closing=true");
    throw new TypeError("network error");
  });
  await expect(closeSession(id)).rejects.toMatchObject({ status: 503 });
  expect(state.query.mock.calls.some((call) => call[0].startsWith("DELETE"))).toBe(false);
  state.row.closing = true;
  state.upstream.mockResolvedValue(undefined);
  await closeSession(id);
  expect(state.query.mock.calls.some((call) => call[0].startsWith("DELETE"))).toBe(true);
});
it("clears invalid sessions after the single refresh attempt is rejected", async () => {
  state.upstream.mockRejectedValue(new ApiError(401, "revoked"));
  await expect(currentUser(id)).rejects.toMatchObject({ status: 401 });
  expect(state.upstream.mock.calls.map((call) => call[0])).toEqual(["me", "refresh"]);
  expect(state.query.mock.calls.some((call) => call[0].startsWith("DELETE"))).toBe(true);
});
it("does not refresh or retry a non-authentication failure", async () => {
  state.upstream.mockRejectedValue(new ApiError(503, "unavailable"));
  await expect(currentUser(id)).rejects.toMatchObject({ status: 503 });
  expect(state.upstream.mock.calls.map((call) => call[0])).toEqual(["me"]);
});
it.each([400, 401, 503])("never replays a failed account mutation (%s)", async (status) => {
  const write = vi.fn().mockRejectedValue(new ApiError(status, "private-detail"));
  await expect(withAccountMutation(id, write)).rejects.toMatchObject({ status });
  expect(write).toHaveBeenCalledTimes(1);
  expect(state.upstream).not.toHaveBeenCalled();
  expect(state.query.mock.calls.some((call) => call[0].startsWith("DELETE"))).toBe(status === 401);
});

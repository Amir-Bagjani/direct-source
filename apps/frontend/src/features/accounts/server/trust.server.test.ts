import { beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/unwrap";
import { trustBff } from "./trust.server";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ id: vi.fn(), request: vi.fn(), read: vi.fn(), write: vi.fn() }));
vi.mock("@/server/auth/config", () => ({
  authConfig: () => ({ origin: "https://market.example" }),
}));
vi.mock("@/server/django-request", () => ({ djangoRequest: mocks.request }));
vi.mock("./session-cookie.server", () => ({ sessionId: mocks.id }));
vi.mock("./session.server", () => ({
  withAccountRead: mocks.read,
  withAccountMutation: mocks.write,
}));
const id = "f81d4fae-7dec-41d0-a765-00a0c91e6bf6";
function request(method = "GET", body?: unknown, query = id, origin = "https://market.example") {
  return new Request(`https://market.example/api/bff/accounts/trust/action?id=${query}`, {
    method,
    headers: { Origin: origin, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.id.mockResolvedValue("opaque");
  const run = async (_id: string, work: (token: string) => Promise<unknown>) =>
    work("server-token");
  mocks.read.mockImplementation(run);
  mocks.write.mockImplementation(run);
});
it("rejects invalid scope, method, path and origin before authenticated transport", async () => {
  expect((await trustBff(request(), "../directory")).status).toBe(400);
  expect((await trustBff(request("GET", undefined, "../../private"), "revision")).status).toBe(400);
  expect(
    (await trustBff(request("POST", {}, id, "https://evil.example"), "controlled")).status,
  ).toBe(403);
  expect((await trustBff(request(), "controlled")).status).toBe(405);
  expect(
    (
      await trustBff(
        request("POST", { business_id: id, user_id: id, reason: "both" }),
        "suspension-propose",
      )
    ).status,
  ).toBe(400);
  expect(mocks.request).not.toHaveBeenCalled();
  mocks.id.mockResolvedValue(null);
  expect((await trustBff(request(), "directory")).status).toBe(401);
});
it.each([403, 404, 409, 503])(
  "preserves %s, hides private errors and does not replay decisions",
  async (status) => {
    mocks.request.mockRejectedValue(new ApiError(status, "private target data"));
    const response = await trustBff(
      request("POST", { command: "suspension_activate", reason: "Reviewed", idempotency_key: id }),
      "work-command",
    );
    expect(response.status).toBe(status);
    expect(await response.text()).not.toContain("private target data");
    expect(mocks.request).toHaveBeenCalledTimes(1);
  },
);
it("uses fixed support and history routes with private no-store responses", async () => {
  mocks.request.mockResolvedValue({ count: 0, results: [] });
  const response = await trustBff(request(), "orders");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(mocks.request).toHaveBeenCalledWith("/api/v1/orders/?page=1", expect.anything(), {
    method: "GET",
    access: "server-token",
  });
  mocks.request.mockResolvedValue({ id, private: "not forwarded" });
  const reply = await trustBff(
    request("POST", { text: "Evidence", files: [], idempotency_key: id, actor: id }),
    "ticket-reply",
  );
  expect(await reply.json()).toEqual({ completed: true });
  expect(mocks.request).toHaveBeenLastCalledWith(
    `/api/v1/support/tickets/${id}/messages/`,
    expect.anything(),
    {
      method: "POST",
      access: "server-token",
      body: { text: "Evidence", files: [], idempotency_key: id },
    },
  );
});

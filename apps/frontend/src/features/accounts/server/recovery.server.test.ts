import { beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/unwrap";
import { recoveryBff } from "./recovery.server";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ django: vi.fn(), session: vi.fn(), mutation: vi.fn() }));
vi.mock("@/server/auth/config", () => ({
  authConfig: () => ({ origin: "https://market.example", cookieName: "ds.session", secure: true }),
}));
vi.mock("@/server/auth/django", () => ({ djangoAuth: mocks.django }));
vi.mock("./session-cookie.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./session-cookie.server")>()),
  sessionId: mocks.session,
}));
vi.mock("./session.server", () => ({ withAccountMutation: mocks.mutation }));
beforeEach(() => vi.resetAllMocks());
function request(body: unknown, method = "POST", origin = "https://market.example") {
  return new Request("https://market.example/api/bff/auth/recovery/confirm", {
    method,
    headers: { Origin: origin, "Content-Type": "application/json" },
    ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
  });
}
it("rejects GET, foreign origins, invalid input and missing sessions before upstream calls", async () => {
  expect((await recoveryBff(request({}, "GET"), "confirm")).status).toBe(405);
  expect((await recoveryBff(request({}, "POST", "https://other.example"), "confirm")).status).toBe(
    403,
  );
  expect((await recoveryBff(request({ token: "bad" }), "confirm")).status).toBe(400);
  expect(
    (await recoveryBff(request({ email: "", current_password: "password" }, "PUT"), "email"))
      .status,
  ).toBe(401);
  expect(mocks.django).not.toHaveBeenCalled();
  expect(mocks.mutation).not.toHaveBeenCalled();
});
it("returns the same accepted response for reset requests without upstream data", async () => {
  mocks.django.mockResolvedValue(undefined);
  const response = await recoveryBff(request({ email: "person@example.test" }), "request-reset");
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({ accepted: true });
  expect(response.headers.get("cache-control")).toBe("no-store");
});
it("removes email only through an authenticated write with the current password", async () => {
  mocks.session.mockResolvedValue("opaque-id");
  mocks.mutation.mockImplementation(async (_id, write: (access: string) => Promise<unknown>) =>
    write("server-access"),
  );
  const body = { email: "", current_password: "current-password" };
  const response = await recoveryBff(request(body, "PUT"), "email");
  expect(response.status).toBe(200);
  expect(mocks.mutation).toHaveBeenCalledWith("opaque-id", expect.any(Function));
  expect(mocks.django).toHaveBeenCalledWith("email", expect.anything(), {
    access: "server-access",
    body,
  });
  expect(await response.json()).toEqual({ accepted: true });
});
it("expires the browser cookie only after confirmed reset and never reflects upstream secrets", async () => {
  const body = { token: "a".repeat(43), password: "a-new-password-123" };
  mocks.django.mockRejectedValueOnce(new ApiError(503, body.token));
  const failed = await recoveryBff(request(body), "reset");
  expect(failed.status).toBe(503);
  expect(failed.headers.has("set-cookie")).toBe(false);
  expect(await failed.text()).not.toContain(body.token);
  mocks.django.mockResolvedValueOnce(undefined);
  const success = await recoveryBff(request(body), "reset");
  expect(success.status).toBe(200);
  expect(success.headers.get("set-cookie")).toContain("Max-Age=0");
  expect(mocks.django).toHaveBeenLastCalledWith("password/reset", expect.anything(), { body });
  expect(await success.text()).not.toContain(body.token);
});

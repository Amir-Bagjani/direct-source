import { beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/unwrap";
import { businessBff } from "./business.server";
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
const input = {
  name: "Business",
  kind: "retailer",
  phone: "02112345678",
  description: "Activity",
  address: { province: "Tehran", city: "Tehran", address: "Address" },
};
function request(method = "GET", body: unknown = input, origin = "https://market.example") {
  return new Request("https://market.example/api/bff/accounts/business", {
    method,
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Authorization: "Bearer browser-token",
    },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
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
it("requires the opaque session and rejects foreign mutations", async () => {
  mocks.id.mockResolvedValue(null);
  expect((await businessBff(request())).status).toBe(401);
  expect((await businessBff(request("POST", input, "https://other.example"))).status).toBe(403);
  expect(mocks.request).not.toHaveBeenCalled();
});
it("returns only the owner's result, never pagination or arbitrary upstream URLs", async () => {
  mocks.request.mockResolvedValue({ count: 0, results: [], next: "https://private.invalid" });
  const response = await businessBff(request());
  expect(await response.json()).toBeNull();
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(mocks.request).toHaveBeenCalledWith("/api/v1/businesses/", expect.anything(), {
    method: "GET",
    access: "server-token",
  });
});
it("validates and strips ownership before one authenticated create", async () => {
  mocks.request.mockResolvedValue({ id: "business" });
  const response = await businessBff(
    request("POST", { ...input, status: "verified", owner: "other" }),
  );
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ created: true });
  expect(mocks.request).toHaveBeenCalledWith("/api/v1/businesses/", expect.anything(), {
    method: "POST",
    access: "server-token",
    body: input,
  });
  expect(mocks.write).toHaveBeenCalledTimes(1);
});
it("rejects invalid input and oversized UTF-8 bodies before writing", async () => {
  expect((await businessBff(request("POST", { ...input, kind: "both" }))).status).toBe(400);
  expect(
    (await businessBff(request("POST", { ...input, description: "الف".repeat(9000) }))).status,
  ).toBe(413);
  expect(mocks.write).not.toHaveBeenCalled();
});
it.each([409, 503])("sanitizes %s without retrying or claiming creation", async (status) => {
  mocks.request.mockRejectedValue(new ApiError(status, "private-upstream-detail"));
  const response = await businessBff(request("POST"));
  expect(response.status).toBe(status);
  expect(await response.text()).not.toContain("private-upstream-detail");
  expect(mocks.request).toHaveBeenCalledTimes(1);
});

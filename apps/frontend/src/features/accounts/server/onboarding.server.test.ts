import { beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/unwrap";
import { onboardingBff } from "./onboarding.server";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  id: vi.fn(),
  request: vi.fn(),
  response: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
}));
vi.mock("@/server/auth/config", () => ({
  authConfig: () => ({ origin: "https://market.example" }),
}));
vi.mock("@/server/django-request", () => ({
  djangoRequest: mocks.request,
  djangoResponse: mocks.response,
}));
vi.mock("./session-cookie.server", () => ({ sessionId: mocks.id }));
vi.mock("./session.server", () => ({
  withAccountRead: mocks.read,
  withAccountMutation: mocks.write,
}));
const id = "f81d4fae-7dec-41d0-a765-00a0c91e6bf6";
function request(method = "GET", body?: unknown, origin = "https://market.example", query = id) {
  return new Request(`https://market.example/api/bff/accounts/onboarding/action?id=${query}`, {
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
it("rejects missing sessions, foreign writes, traversal and wrong methods before upstream", async () => {
  mocks.id.mockResolvedValue(null);
  expect((await onboardingBff(request(), "sections")).status).toBe(401);
  mocks.id.mockResolvedValue("opaque");
  expect((await onboardingBff(request("POST", {}, "https://evil.example"), "submit")).status).toBe(
    403,
  );
  expect(
    (await onboardingBff(request("GET", undefined, undefined, "../../auth"), "sections")).status,
  ).toBe(400);
  expect((await onboardingBff(request(), "review")).status).toBe(405);
  expect(mocks.request).not.toHaveBeenCalled();
});
it("validates identity and activity before writes and never accepts client status", async () => {
  expect((await onboardingBff(request("PUT", { national_id: "secret" }), "identity")).status).toBe(
    400,
  );
  expect(
    (await onboardingBff(request("PUT", { evidence_type: "alternative", files: [id] }), "activity"))
      .status,
  ).toBe(400);
  expect(mocks.write).not.toHaveBeenCalled();
  mocks.request.mockResolvedValue({ private: "not returned" });
  const response = await onboardingBff(
    request("POST", {
      kind: "identity",
      decision: "approved",
      reason: "Reviewed",
      status: "verified",
    }),
    "review",
  );
  expect(await response.json()).toEqual({ completed: true });
  expect(mocks.request).toHaveBeenCalledWith(
    `/api/v1/businesses/${id}/verification/review/`,
    expect.anything(),
    {
      method: "POST",
      access: "server-token",
      body: { kind: "identity", decision: "approved", reason: "Reviewed" },
    },
  );
});
it.each([403, 404, 409, 503])(
  "preserves %s without leaking private details or replaying writes",
  async (status) => {
    mocks.request.mockRejectedValue(new ApiError(status, "private details"));
    const response = await onboardingBff(request("POST"), "submit");
    expect(response.status).toBe(status);
    expect(await response.text()).not.toContain("private details");
    expect(mocks.request).toHaveBeenCalledTimes(1);
  },
);
it("streams only authorized safe content without token or storage URL", async () => {
  mocks.response.mockResolvedValue(
    new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } }),
  );
  const response = await onboardingBff(request(), "content");
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("content-security-policy")).toContain("sandbox");
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  mocks.response.mockResolvedValue(
    new Response("html", { headers: { "content-type": "text/html" } }),
  );
  expect((await onboardingBff(request(), "content")).status).toBe(502);
});
it.each(["business_logo", "suspension", "support"])(
  "validates bounded %s multipart and forwards only scoped fields",
  async (purpose) => {
    const form = new FormData();
    form.set("file", new File(["image"], "image.png", { type: "image/png" }));
    form.set("purpose", purpose);
    form.set("consent_version", "2026-09-07");
    form.set("owner", "forged");
    mocks.request.mockResolvedValue({ id });
    const response = await onboardingBff(
      new Request(`https://market.example/upload?id=${id}`, {
        method: "POST",
        headers: { Origin: "https://market.example" },
        body: form,
      }),
      "upload",
    );
    expect(response.status).toBe(201);
    const sent = mocks.request.mock.calls[0]?.[2].form as FormData;
    expect([...sent.keys()]).toEqual([
      "file",
      purpose === "support" ? "ticket_id" : "purpose",
      "consent_version",
    ]);
    expect(mocks.request.mock.calls[0]?.[0]).toBe(
      purpose === "support" ? "/api/v1/support/files/" : `/api/v1/businesses/${id}/files/`,
    );
    expect(sent.get(purpose === "support" ? "ticket_id" : "purpose")).toBe(
      purpose === "support" ? id : purpose,
    );
  },
);

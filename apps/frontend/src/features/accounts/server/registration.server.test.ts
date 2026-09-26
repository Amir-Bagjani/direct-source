import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { registerAccount } from "./registration.server";

vi.mock("server-only", () => ({}));
const fetchMock = vi.fn<typeof fetch>();
const data = {
  first_name: "Test",
  last_name: "Account",
  mobile: "09123456789",
  password: "A-test-password!",
  accept_terms: true,
};
function request(body: unknown = data, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/bff/auth/register", {
    method: "POST",
    headers: { origin: "http://localhost:3000", "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000");
  vi.stubEnv("DJANGO_API_URL", "http://127.0.0.1:8000");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

it("uses only the fixed upstream, strips browser credentials/privilege fields and returns minimal no-store confirmation", async () => {
  fetchMock.mockResolvedValue(
    Response.json(
      {
        id: "89a250a1-f4b6-47db-b141-769fe65c2d70",
        mobile: "+989123456789",
        first_name: "Test",
        last_name: "Account",
        email: "",
        email_verified_at: null,
        access: "must-not-leak",
      },
      { status: 201 },
    ),
  );
  const response = await registerAccount(
    request(
      { ...data, role: "owner" },
      { cookie: "secret", authorization: "Bearer secret", "x-forwarded-for": "spoofed" },
    ),
  );
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ created: true });
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.has("set-cookie")).toBe(false);
  const [url, init] = fetchMock.mock.calls[0]!;
  expect(String(url)).toBe("http://127.0.0.1:8000/api/v1/auth/register/");
  expect(init).toMatchObject({
    method: "POST",
    cache: "no-store",
    redirect: "error",
    signal: expect.any(AbortSignal),
  });
  expect(new Headers(init?.headers).has("cookie")).toBe(false);
  expect(new Headers(init?.headers).has("authorization")).toBe(false);
  expect(new Headers(init?.headers).has("x-forwarded-for")).toBe(false);
  expect(JSON.parse(String(init?.body))).toEqual({ ...data, mobile: "+989123456789", email: "" });
});

it.each([
  { origin: "https://evil.example" },
  { origin: "null" },
  { origin: "" },
  { "sec-fetch-site": "cross-site" },
])("rejects untrusted origins before upstream access %#", async (headers) => {
  expect((await registerAccount(request(data, headers))).status).toBe(403);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("rejects oversized bodies, invalid JSON, non-JSON and invalid fields without backend writes", async () => {
  expect((await registerAccount(request({ ...data, password: "x".repeat(9000) }))).status).toBe(
    413,
  );
  expect((await registerAccount(request(data, { "content-type": "text/plain" }))).status).toBe(415);
  expect((await registerAccount(request({ ...data, accept_terms: false }))).status).toBe(400);
  expect(
    (
      await registerAccount(
        new Request("http://localhost:3000", {
          method: "POST",
          headers: { origin: "http://localhost:3000", "content-type": "application/json" },
          body: "{",
        }),
      )
    ).status,
  ).toBe(400);
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each([
  [400, "registration_rejected"],
  [429, "registration_throttled"],
  [500, "registration_unavailable"],
] as const)("sanitizes upstream %s and never retries", async (status, code) => {
  fetchMock.mockResolvedValue(
    Response.json(
      {
        code: "invalid",
        message: "private details",
        fields: { mobile: ["private details"] },
        request_id: "backend-id",
      },
      { status },
    ),
  );
  const response = await registerAccount(request());
  expect(await response.json()).toMatchObject({ code });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("does not claim success or retry on malformed upstream responses or uncertain transport failures", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ access: "private" }, { status: 201 }));
  expect((await registerAccount(request())).status).toBe(502);
  fetchMock.mockRejectedValueOnce(new Error("sensitive upstream error"));
  expect(await (await registerAccount(request())).text()).not.toContain("sensitive");
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it.each(["file:///tmp", "https://user:secret@example.com", "https://example.com/path", "invalid"])(
  "fails closed for invalid configured origins %#",
  async (url) => {
    vi.stubEnv("NEXTAUTH_URL", url);
    expect((await registerAccount(request())).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  },
);

it("requires explicit web/backend origins in production", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXTAUTH_URL", "");
  expect((await registerAccount(request())).status).toBe(503);
  expect(fetchMock).not.toHaveBeenCalled();
});

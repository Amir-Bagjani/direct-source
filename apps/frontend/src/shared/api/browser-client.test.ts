import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { bffRequest } from "./browser-client";

const itemSchema = z.object({ id: z.number() });

afterEach(() => vi.unstubAllGlobals());

it.each([
  "https://api.example.test/items",
  "//attacker.test/api/bff/items",
  "/api/items",
  "/api/bff/../private",
  "/api/bff/%2e%2e/private",
  "/api/bff/.%2E/private",
  "/api/bff/%252e%252e/private",
  "/api/bff/items%2f..%2fprivate",
  "/api/bff/items%5c..%5cprivate",
  "/api/bff/items\\..\\private",
  "/api/bff/\t..\n/private",
  "/api/bff/items#private",
])("rejects a request outside the BFF allowlist: %s", async (path) => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(bffRequest(path, itemSchema)).rejects.toThrow("Only BFF paths are allowed");
  expect(fetch).not.toHaveBeenCalled();
});

it("forces same-origin credentials and no-store for browser BFF requests", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ id: 42 }));
  vi.stubGlobal("fetch", fetch);
  await expect(
    bffRequest("/api/bff/items/42", itemSchema, {
      cache: "force-cache",
      credentials: "include",
      redirect: "follow",
      headers: { "x-client": "test" },
    }),
  ).resolves.toEqual({ id: 42 });
  expect(fetch).toHaveBeenCalledWith("/api/bff/items/42", {
    cache: "no-store",
    credentials: "same-origin",
    redirect: "error",
    headers: { "x-client": "test" },
  });
});

it("allows ordinary encoded identifiers and query text without inspecting them as paths", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ id: 42 }));
  vi.stubGlobal("fetch", fetch);
  const path = "/api/bff/items/%D8%A8?q=a..b&next=%2Fpublic";
  await expect(bffRequest(path, itemSchema)).resolves.toEqual({ id: 42 });
  expect(fetch).toHaveBeenCalledWith(path, expect.objectContaining({ redirect: "error" }));
});

it("forwards cancellation to fetch so query cancellation can stop an in-flight request", async () => {
  const controller = new AbortController();
  const fetch = vi.fn().mockResolvedValue(Response.json({ id: 42 }));
  vi.stubGlobal("fetch", fetch);
  await bffRequest("/api/bff/items/42", itemSchema, { signal: controller.signal });
  expect(fetch).toHaveBeenCalledWith(
    "/api/bff/items/42",
    expect.objectContaining({ signal: controller.signal }),
  );
});

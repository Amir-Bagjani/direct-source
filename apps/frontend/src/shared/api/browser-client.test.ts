import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { bffRequest } from "./browser-client";

const itemSchema = z.object({ id: z.number() });

afterEach(() => vi.unstubAllGlobals());

it.each(["https://api.example.test/items", "/api/items", "/api/bff/../private"])(
  "rejects a request outside the BFF allowlist: %s",
  async (path) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(bffRequest(path, itemSchema)).rejects.toThrow("Only BFF paths are allowed");
    expect(fetch).not.toHaveBeenCalled();
  },
);

it("forces same-origin credentials and no-store for browser BFF requests", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ id: 42 }));
  vi.stubGlobal("fetch", fetch);
  await expect(
    bffRequest("/api/bff/items/42", itemSchema, {
      cache: "force-cache",
      credentials: "include",
      headers: { "x-client": "test" },
    }),
  ).resolves.toEqual({ id: 42 });
  expect(fetch).toHaveBeenCalledWith("/api/bff/items/42", {
    cache: "no-store",
    credentials: "same-origin",
    headers: { "x-client": "test" },
  });
});

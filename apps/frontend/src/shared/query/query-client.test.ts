import { dehydrate, hydrate, queryOptions } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { getQueryClient, makeQueryClient } from "./query-client";
import { ApiError } from "@/shared/api/unwrap";

it("isolates caches between client instances and never retries mutations/permission failures", () => {
  const first = makeQueryClient();
  const second = makeQueryClient();
  first.setQueryData(["private"], { id: 1 });
  expect(second.getQueryData(["private"])).toBeUndefined();
  expect(first.getDefaultOptions().mutations?.retry).toBe(false);
  const retry = first.getDefaultOptions().queries?.retry;
  if (typeof retry !== "function") throw new Error("Expected retry policy");
  expect(retry(0, new ApiError(401, "unauthorized"))).toBe(false);
  expect(retry(0, new ApiError(503, "unavailable"))).toBe(true);
  expect(retry(1, new ApiError(503, "unavailable"))).toBe(false);
});

it("never shares the server provider cache", () => {
  const first = getQueryClient();
  first.setQueryData(["private"], { id: 1 });
  const second = getQueryClient();
  expect(second).not.toBe(first);
  expect(second.getQueryData(["private"])).toBeUndefined();
  first.clear();
  second.clear();
});

it("reuses prefetched query options after hydration and invalidates only the selected key", async () => {
  const read = vi.fn(async (id: number) => ({ id }));
  const detail = (id: number) =>
    queryOptions({
      queryKey: ["fixture", "detail", id] as const,
      queryFn: () => read(id),
    });
  const server = makeQueryClient();
  const browser = makeQueryClient();
  try {
    await Promise.all([server.prefetchQuery(detail(1)), server.prefetchQuery(detail(2))]);
    hydrate(browser, dehydrate(server));
    expect(await browser.fetchQuery(detail(1))).toEqual({ id: 1 });
    expect(read).toHaveBeenCalledTimes(2);
    await browser.invalidateQueries({ queryKey: detail(1).queryKey, exact: true });
    await browser.fetchQuery(detail(1));
    await browser.fetchQuery(detail(2));
    expect(read).toHaveBeenCalledTimes(3);
  } finally {
    server.clear();
    browser.clear();
  }
});

it("does not dehydrate failed queries or pending requests by default", async () => {
  const client = makeQueryClient();
  try {
    await client.prefetchQuery({
      queryKey: ["failed"],
      queryFn: () => Promise.reject(new ApiError(401, "unauthorized")),
    });
    const pending = client.prefetchQuery({
      queryKey: ["pending"],
      queryFn: () => new Promise<never>(() => {}),
    });
    expect(dehydrate(client).queries).toEqual([]);
    await client.cancelQueries();
    await pending;
  } finally {
    client.clear();
  }
});

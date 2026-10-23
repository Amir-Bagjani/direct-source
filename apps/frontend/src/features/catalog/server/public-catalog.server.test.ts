import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/server/api-config", () => ({ apiConfig: () => ({ backend: "https://backend.test" }) }));
import { publicReviewsBff, publicReviewImagesBff } from "./public-catalog.server";
const product = "11111111-1111-4111-8111-111111111111";
afterEach(() => vi.unstubAllGlobals());
it("pins anonymous requests to published product reviews with bounded pages and no credentials", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(Response.json({ count: 0, next: null, previous: null, results: [] }));
  vi.stubGlobal("fetch", fetcher);
  const response = await publicReviewsBff(
    new Request("https://site.test/reviews?page=2", {
      headers: { cookie: "private=session", authorization: "Bearer private" },
    }),
    product,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(fetcher.mock.calls[0]?.[0]).toBe(
    `https://backend.test/api/v1/reviews/public/?topic=product&product=${product}&page=2&page_size=5`,
  );
  expect(fetcher.mock.calls[0]?.[1]).toEqual(
    expect.objectContaining({ cache: "no-store", redirect: "error" }),
  );
  expect(fetcher.mock.calls[0]?.[1]).not.toHaveProperty("headers");
  for (const query of [
    "page=0",
    "page=1.5",
    "page=99999999",
    "page=1&page=2",
    "topic=retailer",
    "business=other",
  ]) {
    expect(
      (await publicReviewsBff(new Request(`https://site.test/reviews?${query}`), product)).status,
    ).toBe(400);
  }
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("rechecks public review visibility and never fetches files hidden by moderation", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    Response.json({
      id: product,
      topic: "product",
      product,
      variants: [],
      author_label: "Buyer",
      scores: { overall: 5, quality: 5, conformity: 5 },
      text: "",
      images: [product],
      content_hidden: true,
      published_at: "2026-10-17T12:00:00Z",
      reply: null,
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  const response = await publicReviewImagesBff(new Request("https://site.test/images"), product);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual([]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  fetcher.mockResolvedValue(
    Response.json(
      { code: "not_found", message: "private details", request_id: "request" },
      { status: 404 },
    ),
  );
  const unavailable = await publicReviewImagesBff(new Request("https://site.test/images"), product);
  expect(unavailable.status).toBe(404);
  expect(await unavailable.text()).not.toContain("private details");
});
it("resolves only the visible review's selected files through the public image permission check", async () => {
  const file = "22222222-2222-4222-8222-222222222222";
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        id: product,
        topic: "product",
        product,
        variants: [],
        author_label: "Buyer",
        scores: { overall: 5, quality: 5, conformity: 5 },
        text: "Good",
        images: [file],
        content_hidden: false,
        published_at: "2026-10-17T12:00:00Z",
        reply: null,
      }),
    )
    .mockResolvedValueOnce(Response.json({ url: "https://images.test/short-lived-signed-link" }));
  vi.stubGlobal("fetch", fetcher);
  const response = await publicReviewImagesBff(new Request("https://site.test/images"), product);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(["https://images.test/short-lived-signed-link"]);
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
    `https://backend.test/api/v1/reviews/public/${product}/`,
    `https://backend.test/api/v1/reviews/public/${product}/images/${file}/`,
  ]);
  expect(response.headers.get("cache-control")).toBe("no-store");
});

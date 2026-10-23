// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, it, vi } from "vitest";
import en from "../../../../../messages/en.json";
import { ProductReviews } from "./product-reviews";
import type { PublicReview } from "../../schemas/public-reviews.schema";

const api = vi.hoisted(() => ({ readPublicReviews: vi.fn(), readPublicReviewImages: vi.fn() }));
vi.mock("../../api/public-reviews.api", () => api);
const row: PublicReview = {
  id: "11111111-1111-4111-8111-111111111111",
  topic: "product",
  product: "22222222-2222-4222-8222-222222222222",
  variants: [],
  author_label: "خریدار تأییدشده",
  scores: { overall: 5, quality: 4, conformity: 5 },
  text: "Accurate description",
  images: ["33333333-3333-4333-8333-333333333333"],
  content_hidden: false,
  published_at: "2026-10-17T12:00:00Z",
  reply: {
    id: "44444444-4444-4444-8444-444444444444",
    text: "Thank you",
    submitted_at: "2026-10-17T13:00:00Z",
    content_hidden: false,
    author_label: "Maker",
  },
};
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
function view() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Tehran">
        <ProductReviews id={row.product} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}
it("loads review images only on request and pages through the fixed product query", async () => {
  api.readPublicReviews.mockImplementation((_id, page) =>
    Promise.resolve({
      count: 6,
      next: page === 1 ? "https://backend.test/page2" : null,
      previous: page === 2 ? "https://backend.test/page1" : null,
      results: page === 1 ? [row] : [],
    }),
  );
  api.readPublicReviewImages.mockResolvedValue(["https://images.test/review.png"]);
  view();
  expect(await screen.findByText("Accurate description")).toBeDefined();
  expect(screen.getByText(en.catalog.reviews.verifiedBuyer)).toBeDefined();
  expect(screen.getByText("Thank you")).toBeDefined();
  expect(screen.getAllByText("5 out of 5")).toHaveLength(2);
  expect(api.readPublicReviewImages).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Show review images (1)" }));
  expect(await screen.findByRole("img", { name: en.catalog.reviews.imagesLabel })).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: en.catalog.next }));
  expect(await screen.findByText(en.catalog.reviews.empty)).toBeDefined();
  expect(api.readPublicReviews.mock.calls.at(-1)?.slice(0, 2)).toEqual([row.product, 2]);
  fireEvent.click(screen.getByRole("button", { name: en.catalog.previous }));
  expect(await screen.findByText("Accurate description")).toBeDefined();
});
it("keeps scores but masks moderated review and reply content even if transport includes text", async () => {
  api.readPublicReviews.mockResolvedValue({
    count: 1,
    next: null,
    previous: null,
    results: [{ ...row, content_hidden: true, reply: { ...row.reply, content_hidden: true } }],
  });
  view();
  expect(await screen.findAllByText(en.catalog.reviews.hidden)).toHaveLength(2);
  expect(screen.queryByText(row.text)).toBeNull();
  expect(screen.queryByText("Thank you")).toBeNull();
  expect(screen.queryByRole("button", { name: /Show review images/ })).toBeNull();
  expect(screen.getByText("4 out of 5")).toBeDefined();
  expect(api.readPublicReviewImages).not.toHaveBeenCalled();
});
it("shows loading and a retryable error without showing old content", async () => {
  let fail: ((reason: Error) => void) | undefined;
  api.readPublicReviews.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
  );
  api.readPublicReviews.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
  view();
  expect(screen.getByRole("status").textContent).toBe(en.catalog.reviews.loading);
  await waitFor(() => expect(fail).toBeDefined());
  fail?.(new Error("Unavailable"));
  expect(await screen.findByText(en.catalog.reviews.unavailable)).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: en.common.retry }));
  expect(await screen.findByText(en.catalog.reviews.empty)).toBeDefined();
});

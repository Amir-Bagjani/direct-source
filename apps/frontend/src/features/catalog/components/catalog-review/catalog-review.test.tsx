// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, it, vi } from "vitest";
import en from "../../../../../messages/en.json";
import { ApiError } from "@/shared/api/unwrap";
import { CatalogProductReview, CatalogRevisionReview } from "./catalog-review";
import { catalogKeys } from "../../queries/catalog.keys";
vi.mock("../revision-comparison/revision-comparison", () => ({ RevisionComparison: () => null }));
vi.mock("../product-preview/product-preview", () => ({ ProductPreview: () => null }));
const api = vi.hoisted(() => ({ access: vi.fn(), product: vi.fn(), revision: vi.fn() }));
vi.mock("@/features/accounts/contracts/catalog-workspace", () => ({
  useCatalogWorkspaceSession: () => ({ scope: "actor", authorized: true }),
}));
vi.mock("../../api/catalog-management.api", async (original) => ({
  ...(await original<typeof import("../../api/catalog-management.api")>()),
  readStudioAccess: api.access,
  readReviewDetail: api.product,
  readRevision: api.revision,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, ...props }: ComponentProps<"a">) => <a {...props}>{children}</a>,
  useRouter: () => ({ replace: vi.fn() }),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
for (const kind of ["product", "revision"] as const) {
  it(`${kind}: preserves a masked decision draft through a temporary outage and unmounts it after permission loss`, async () => {
    api.access.mockResolvedValue({ scope: "actor", operator: true });
    api.product.mockResolvedValue({
      product: {
        name: "Product",
        brand: "",
        manufacturer_model: "",
        description: "Description",
        images: [],
      },
      variants: [],
      supplies: [],
      sales_plan: null,
      shipping: null,
      readiness: {
        ready: true,
        checks: (["business", "content", "variants", "supply", "pricing", "shipping"] as const).map(
          (code) => ({ code, passed: true }),
        ),
      },
    });
    api.revision.mockResolvedValue({
      revision: { before: {}, proposed: {} },
      taxonomy: { categories: [], attributes: [], options: [] },
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Tehran">
          {kind === "product" ? (
            <CatalogProductReview id="product" />
          ) : (
            <CatalogRevisionReview id="revision" />
          )}
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
    const reason = await screen.findByLabelText(en.catalogManagement.reason);
    fireEvent.change(reason, { target: { value: "Unsent decision rationale" } });
    api.access.mockRejectedValue(new Error("Temporary outage"));
    await act(async () => {
      await client.refetchQueries({ queryKey: catalogKeys.studioAccess("actor") });
    });
    expect(await screen.findByText(en.catalogManagement.loadError)).toBeDefined();
    expect(screen.queryByRole("textbox", { name: en.catalogManagement.reason })).toBeNull();
    expect(reason.isConnected).toBe(true);
    api.access.mockResolvedValue({ scope: "actor", operator: true });
    fireEvent.click(screen.getByRole("button", { name: en.common.retry }));
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: en.catalogManagement.reason })).toBe(reason),
    );
    expect((reason as HTMLTextAreaElement).value).toBe("Unsent decision rationale");
    api.access.mockRejectedValue(new ApiError(403, "forbidden"));
    await act(async () => {
      await client.refetchQueries({ queryKey: catalogKeys.studioAccess("actor") });
    });
    expect(await screen.findByText(en.catalogManagement.operatorRequired)).toBeDefined();
    expect(reason.isConnected).toBe(false);
    expect(screen.queryByText(en.catalogManagement.loading)).toBeNull();
    client.clear();
  });
}

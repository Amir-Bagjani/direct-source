// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, it, vi } from "vitest";
import en from "../../../../../messages/en.json";
import type { Editor } from "../../schemas/catalog-management.schema";
import { ProductEditor } from "./product-editor";

vi.mock("../product-preview/product-preview", () => ({ ProductPreview: () => null }));
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  editor: vi.fn(),
  upload: vi.fn(),
  revision: vi.fn(),
}));
vi.mock("@/features/accounts/contracts/catalog-workspace", () => ({
  useCatalogWorkspaceSession: () => ({ scope: "actor", authorized: true }),
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("../../api/catalog-management.api", async (original) => ({
  ...(await original<typeof import("../../api/catalog-management.api")>()),
  readStudioAccess: mocks.access,
  readEditor: mocks.editor,
  uploadProductImage: mocks.upload,
  saveRevision: mocks.revision,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, ...props }: ComponentProps<"a">) => <a {...props}>{children}</a>,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("retains concurrent variant edits when an image upload finishes and blocks premature revision save", async () => {
  const image = "11111111-1111-4111-8111-111111111111";
  const uploaded = "22222222-2222-4222-8222-222222222222";
  const editor: Editor = {
    product: {
      id: "product",
      business: "business",
      category: "category",
      name: "Product",
      description: "Description",
      brand: "",
      manufacturer_model: "",
      attributes: {},
      images: [image],
      status: "published",
      created_at: "2026-10-12",
      updated_at: "2026-10-12",
    },
    variants: [
      {
        id: "variant",
        product: "product",
        sku: "SKU-A",
        attributes: {},
        images: [],
        effective_images: [image],
        is_active: true,
        disabled_code: "",
        status_reason: "",
      },
    ],
    taxonomy: { categories: [], attributes: [], options: [] },
    sales_plan: null,
    shipping: null,
    supplies: {},
    services: [],
    revisions: [],
    readiness: {
      ready: true,
      checks: (["business", "content", "variants", "supply", "pricing", "shipping"] as const).map(
        (code) => ({ code, passed: true }),
      ),
    },
  };
  mocks.access.mockResolvedValue({
    scope: "actor",
    business: { id: "business", kind: "manufacturer", status: "verified", addresses: [] },
    operator: false,
    owner: false,
    consent_version: "1",
  });
  mocks.editor.mockResolvedValue(editor);
  let finishUpload: (file: { id: string }) => void = () => {
    throw new Error("Upload not started");
  };
  const pending = new Promise<{ id: string }>((resolve) => {
    finishUpload = resolve;
  });
  mocks.upload.mockReturnValue(pending);
  mocks.revision.mockResolvedValue({});
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Tehran">
        <ProductEditor id="product" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  const fields = within(await screen.findByRole("group", { name: "SKU-A" }));
  fireEvent.change(fields.getByLabelText(en.catalogManagement.variantImages), {
    target: { files: [new File(["image"], "variant.png", { type: "image/png" })] },
  });
  const save = screen.getByRole("button", { name: en.catalogManagement.createRevision });
  await waitFor(() => expect(save.hasAttribute("disabled")).toBe(true));
  fireEvent.change(fields.getByLabelText(en.catalogManagement.sku), {
    target: { value: "SKU-EDITED" },
  });
  await act(async () => {
    finishUpload({ id: uploaded });
    await pending;
  });
  await waitFor(() => expect(save.hasAttribute("disabled")).toBe(false));
  expect(fields.getByLabelText(en.catalogManagement.sku).getAttribute("value")).toBe("SKU-EDITED");
  fireEvent.submit(save.closest("form")!);
  await waitFor(() => expect(mocks.revision).toHaveBeenCalled());
  expect(mocks.revision.mock.calls[0]?.[1]).toMatchObject({
    variants: [{ id: "variant", sku: "SKU-EDITED", images: [uploaded] }],
  });
  client.clear();
});

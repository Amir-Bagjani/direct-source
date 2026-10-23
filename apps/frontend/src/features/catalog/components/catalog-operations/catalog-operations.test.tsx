// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, it, vi } from "vitest";
import en from "../../../../../messages/en.json";
import { CatalogOperations } from "./catalog-operations";
import { catalogKeys } from "../../queries/catalog.keys";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  dashboard: vi.fn(),
  save: vi.fn(),
  review: vi.fn(),
}));
vi.mock("@/features/accounts/contracts/catalog-workspace", () => ({
  useCatalogWorkspaceSession: () => ({ scope: "actor", authorized: true }),
}));
vi.mock("../../api/catalog-management.api", async (original) => ({
  ...(await original<typeof import("../../api/catalog-management.api")>()),
  readStudioAccess: mocks.access,
  readOperatorDashboard: mocks.dashboard,
  saveTaxonomy: mocks.save,
  reviewProposal: mocks.review,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, ...props }: ComponentProps<"a">) => <a {...props}>{children}</a>,
  useRouter: () => ({ push: vi.fn() }),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const categoryId = "11111111-1111-4111-8111-111111111111";
const attributeId = "22222222-2222-4222-8222-222222222222";
const option = {
  id: "33333333-3333-4333-8333-333333333333",
  attribute: attributeId,
  code: "red",
  label: "Red",
  position: 4,
  is_active: true,
};
function view(proposals: unknown[] = [], revisions: unknown[] = []) {
  mocks.access.mockResolvedValue({ scope: "actor", operator: true });
  mocks.dashboard.mockResolvedValue({
    products: [],
    revisions,
    proposals,
    taxonomy: {
      categories: [
        {
          id: categoryId,
          name: "Shoes",
          parent: null,
          slug: "shoes",
          description: "",
          position: 0,
          is_active: true,
        },
      ],
      attributes: [
        {
          id: attributeId,
          category: categoryId,
          kind: "choice",
          code: "color",
          name: "Color",
          description: "",
          unit: "",
          scope: "variant",
          required: true,
          filterable: true,
          position: 0,
          is_active: true,
          options: [option],
        },
      ],
      options: [option],
    },
  });
  mocks.save.mockResolvedValue({});
  mocks.review.mockResolvedValue({});
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Tehran">
        <CatalogOperations />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return client;
}
it("identifies revision queue cases by their current product name", async () => {
  const client = view(
    [],
    [
      {
        id: attributeId,
        product: categoryId,
        product_name: "چرم آفتاب — Shoes",
        status: "pending",
        assigned_to: null,
        created_at: "2026-10-18T10:00:00Z",
      },
    ],
  );
  const row = await screen.findByRole("group", { name: "چرم آفتاب — Shoes" });
  expect(
    within(row).getByRole("button", { name: en.catalogManagement.claimAndReview }),
  ).toBeDefined();
  expect(within(row).queryByText(categoryId)).toBeNull();
  client.clear();
});
it("edits existing standard option labels while preserving the protected code and identity", async () => {
  const client = view();
  const label = await screen.findByText("Red");
  fireEvent.click(
    within(label.closest("div")!).getByRole("button", {
      name: en.catalogManagement.editDefinition,
    }),
  );
  const name = screen.getByLabelText(en.catalogManagement.name);
  expect(name.getAttribute("value")).toBe("Red");
  fireEvent.change(name, { target: { value: "Crimson" } });
  const save = screen.getByRole("button", { name: en.catalogManagement.saveDefinition });
  fireEvent.submit(save.closest("form")!);
  await waitFor(() =>
    expect(mocks.save).toHaveBeenCalledWith(
      { ...option, kind: "option", label: "Crimson" },
      expect.anything(),
    ),
  );
  client.clear();
});
it("retains masked taxonomy edits through a temporary failure and removes them when the operator role is revoked", async () => {
  const client = view();
  const label = await screen.findByText("Red");
  fireEvent.click(
    within(label.closest("div")!).getByRole("button", {
      name: en.catalogManagement.editDefinition,
    }),
  );
  const input = screen.getByLabelText(en.catalogManagement.name);
  fireEvent.change(input, { target: { value: "Unsaved label" } });
  mocks.access.mockRejectedValue(new Error("Temporary outage"));
  await act(async () => {
    await client.refetchQueries({ queryKey: catalogKeys.studioAccess("actor") });
  });
  expect(await screen.findByText(en.catalogManagement.loadError)).toBeDefined();
  expect(screen.queryByRole("textbox", { name: en.catalogManagement.name })).toBeNull();
  expect(input.isConnected).toBe(true);
  mocks.access.mockResolvedValue({ scope: "actor", operator: true });
  fireEvent.click(screen.getByRole("button", { name: en.common.retry }));
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: en.catalogManagement.name })).toBe(input),
  );
  expect((input as HTMLInputElement).value).toBe("Unsaved label");
  mocks.access.mockResolvedValue({ scope: "actor", operator: false });
  await act(async () => {
    await client.refetchQueries({ queryKey: catalogKeys.studioAccess("actor") });
  });
  expect(await screen.findByText(en.catalogManagement.operatorRequired)).toBeDefined();
  expect(input.isConnected).toBe(false);
  expect(screen.queryByText(en.catalogManagement.loading)).toBeNull();
  client.clear();
});
it("requires a decision reason and explicit operator definition before approving an attribute proposal", async () => {
  const client = view([
    {
      id: "proposal",
      kind: "attribute",
      category: categoryId,
      attribute: null,
      name: "Weight",
      description: "Weight per unit",
      example: "300 g",
    },
  ]);
  const heading = await screen.findByRole("heading", { name: /Weight/ });
  const fields = within(heading.closest("section")!);
  expect(
    fields.getByRole("button", { name: en.catalogManagement.approve }).hasAttribute("disabled"),
  ).toBe(true);
  expect(fields.getByLabelText(en.catalogManagement.code).getAttribute("value")).toBe("");
  fireEvent.change(fields.getByLabelText(en.catalogManagement.reason), {
    target: { value: "Approved standard weight" },
  });
  fireEvent.change(fields.getByLabelText(en.catalogManagement.code), {
    target: { value: "weight" },
  });
  fireEvent.change(fields.getByLabelText(en.catalogManagement.attributeKind), {
    target: { value: "number" },
  });
  fireEvent.change(fields.getByLabelText(en.catalogManagement.unit), { target: { value: "g" } });
  fireEvent.change(fields.getByLabelText(en.catalogManagement.attributeScope), {
    target: { value: "variant" },
  });
  fireEvent.submit(
    fields.getByRole("button", { name: en.catalogManagement.approve }).closest("form")!,
  );
  await waitFor(() =>
    expect(mocks.review).toHaveBeenCalledWith("proposal", {
      decision: "approved",
      reason: "Approved standard weight",
      definition: {
        category: categoryId,
        code: "weight",
        name: "Weight",
        description: "Weight per unit",
        kind: "number",
        scope: "variant",
        unit: "g",
        required: false,
        filterable: false,
        position: 0,
        is_active: true,
      },
    }),
  );
  client.clear();
});

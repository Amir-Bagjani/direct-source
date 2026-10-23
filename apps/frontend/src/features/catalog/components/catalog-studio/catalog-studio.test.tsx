// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, it, vi } from "vitest";
import en from "../../../../../messages/en.json";
import { CatalogStudio } from "./catalog-studio";
import { ApiError } from "@/shared/api/unwrap";
import { catalogKeys } from "../../queries/catalog.keys";

const mocks = vi.hoisted(() => ({ access: vi.fn(), studio: vi.fn(), authorized: true }));
vi.mock("@/features/accounts/contracts/catalog-workspace", () => ({
  useCatalogWorkspaceSession: () => ({ scope: "actor", authorized: mocks.authorized }),
}));
vi.mock("../../api/catalog-management.api", () => ({
  readStudioAccess: mocks.access,
  readStudio: mocks.studio,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, ...props }: ComponentProps<"a">) => <a {...props}>{children}</a>,
  useRouter: () => ({ push: vi.fn() }),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  mocks.authorized = true;
});
function view() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = () => (
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Tehran">
        <CatalogStudio />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  const rendered = render(tree());
  return { ...rendered, client, refresh: () => rendered.rerender(tree()) };
}
it("shows access failure instead of leaving a disabled dependent query loading forever", async () => {
  mocks.access.mockRejectedValue(new Error("unavailable"));
  view();
  await screen.findByText(en.catalogManagement.loadError);
  expect(mocks.studio).not.toHaveBeenCalled();
  expect(screen.queryByText(en.catalogManagement.loading)).toBeNull();
});
it("masks and preserves a draft through transient access failure, then discards it on terminal denial", async () => {
  const access = {
    scope: "actor",
    business: { id: "business", kind: "manufacturer", status: "draft" },
    operator: false,
  };
  mocks.access.mockResolvedValue(access);
  mocks.studio.mockResolvedValue({
    taxonomy: { categories: [], attributes: [], options: [] },
    products: [],
    proposals: [],
  });
  const { client } = view();
  const name = await screen.findByLabelText(en.catalogManagement.name);
  fireEvent.change(name, { target: { value: "Unsaved product name" } });
  mocks.access.mockRejectedValue(new Error("Temporary outage"));
  await act(async () => {
    await client.refetchQueries({ queryKey: catalogKeys.studioAccess("actor") });
  });
  expect(await screen.findByText(en.catalogManagement.loadError)).toBeDefined();
  expect(screen.queryByRole("textbox", { name: en.catalogManagement.name })).toBeNull();
  expect(name.isConnected).toBe(true);
  mocks.access.mockResolvedValue(access);
  fireEvent.click(screen.getByRole("button", { name: en.common.retry }));
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: en.catalogManagement.name })).toBe(name),
  );
  expect((name as HTMLInputElement).value).toBe("Unsaved product name");
  mocks.access.mockRejectedValue(new ApiError(403, "forbidden"));
  await act(async () => {
    await client.refetchQueries({ queryKey: catalogKeys.studioAccess("actor") });
  });
  expect(await screen.findByText(en.catalogManagement.forbidden)).toBeDefined();
  expect(name.isConnected).toBe(false);
  client.clear();
});
it("allows optional brand/model and displays the producer's proposal decision", async () => {
  mocks.access.mockResolvedValue({
    scope: "actor",
    business: { id: "business", kind: "manufacturer", status: "draft" },
    operator: false,
  });
  mocks.studio.mockResolvedValue({
    taxonomy: { categories: [], attributes: [], options: [] },
    products: [],
    proposals: [
      {
        id: "proposal",
        name: "Proposed category",
        description: "Description",
        reason: "Not in scope",
        status: "rejected",
      },
    ],
  });
  view();
  await waitFor(() => expect(screen.getByLabelText(en.catalogManagement.brand)).toBeDefined());
  expect(screen.getByLabelText(en.catalogManagement.brand).hasAttribute("required")).toBe(false);
  expect(screen.getByLabelText(en.catalogManagement.model).hasAttribute("required")).toBe(false);
  expect(screen.getByText("Not in scope")).toBeDefined();
  expect(screen.getByText(en.catalogManagement.proposalStatuses.rejected)).toBeDefined();
});

it("keeps the same form host when the session boundary clears private cache before revalidation", async () => {
  mocks.access.mockResolvedValue({
    scope: "actor",
    business: { id: "business", kind: "manufacturer", status: "draft" },
    operator: false,
  });
  mocks.studio.mockResolvedValue({
    taxonomy: { categories: [], attributes: [], options: [] },
    products: [],
    proposals: [],
  });
  const { client, refresh } = view();
  const name = await screen.findByLabelText(en.catalogManagement.name);
  fireEvent.change(name, { target: { value: "Draft through pagehide" } });
  act(() => {
    mocks.authorized = false;
    client.clear();
    refresh();
  });
  expect(name.isConnected).toBe(true);
  expect(screen.queryByRole("textbox", { name: en.catalogManagement.name })).toBeNull();
  act(() => {
    mocks.authorized = true;
    refresh();
  });
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: en.catalogManagement.name })).toBe(name),
  );
  expect((name as HTMLInputElement).value).toBe("Draft through pagehide");
  client.clear();
});

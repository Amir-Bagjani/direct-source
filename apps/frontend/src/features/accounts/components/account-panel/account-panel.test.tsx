// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { makeQueryClient } from "@/shared/query/query-client";
import messages from "../../../../../messages/en.json";
import { AccountPanel } from "./account-panel";
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a>,
}));
const user = {
  id: "89a250a1-f4b6-47db-b141-769fe65c2d70",
  first_name: "Private",
  last_name: "Person",
  mobile: "+989123456789",
  email: "",
  email_verified_at: null,
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function setup() {
  const client = makeQueryClient();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={client}>
        <AccountPanel />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  return client;
}
it("hides before a persisted page snapshot and waits for fresh authorization on restore", async () => {
  let complete!: (response: Response) => void;
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(Response.json(user))
    .mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          complete = resolve;
        }),
    );
  vi.stubGlobal("fetch", fetchMock);
  setup();
  await screen.findByText("Private Person");
  act(() => {
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
  });
  expect(screen.queryByText("Private Person")).toBeNull();
  act(() => {
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
  });
  expect(screen.queryByText("Private Person")).toBeNull();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  await act(async () => {
    complete(Response.json(user));
  });
  await screen.findByText("Private Person");
});
it("clears private cache immediately and reports uncertain logout without claiming success", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(Response.json(user))
      .mockResolvedValue(
        Response.json(
          { code: "logout_uncertain", message: "private upstream detail", request_id: "test" },
          { status: 503 },
        ),
      ),
  );
  const client = setup();
  await screen.findByText("Private Person");
  fireEvent.click(screen.getByRole("button", { name: messages.accounts.account.logout }));
  await screen.findByText(messages.accounts.account.logoutUncertain);
  expect(screen.queryByText("Private Person")).toBeNull();
  expect(screen.queryByText("private upstream detail")).toBeNull();
  expect(
    client
      .getQueryCache()
      .getAll()
      .every((entry) => entry.state.data === undefined && entry.state.fetchStatus === "idle"),
  ).toBe(true);
  expect(screen.getByRole("button", { name: messages.accounts.account.retryLogout })).toBeDefined();
});

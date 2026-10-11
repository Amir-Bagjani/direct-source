// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { makeQueryClient } from "@/shared/query/query-client";
import messages from "../../../../../messages/en.json";
import { AccountScreen } from "../account-screen/account-screen";
import { Button } from "@/shared/ui/button/button";
import { useProtectedSession } from "./protected-session-context";
function AccountForm() {
  const { user, logout, loggingOut } = useProtectedSession();
  return (
    <>
      <p>
        {user.first_name} {user.last_name}
      </p>
      <AccountScreen view="business" />
      <Button onClick={() => void logout()} disabled={loggingOut}>
        {messages.accounts.account.logout}
      </Button>
    </>
  );
}
import { ProtectedSessionBoundary } from "./protected-session-boundary";
import { accountKeys } from "../../queries/accounts.keys";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/account/business",
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
        <ProtectedSessionBoundary>
          <AccountForm />
        </ProtectedSessionBoundary>
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
  vi.stubGlobal("fetch", (path: string) =>
    path === "/api/bff/accounts/business"
      ? Promise.resolve(Response.json(null))
      : path.includes("onboarding/queue") || path.includes("trust/access")
        ? Promise.resolve(
            Response.json(
              { code: "forbidden", message: "forbidden", request_id: "test" },
              { status: 403 },
            ),
          )
        : fetchMock(),
  );
  setup();
  await screen.findByText("Private Person");
  act(() => {
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
  });
  expect(screen.getByText("Private Person").closest('[aria-hidden="true"]')).not.toBeNull();
  act(() => {
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
  });
  expect(screen.getByText("Private Person").closest('[aria-hidden="true"]')).not.toBeNull();
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

it("revalidates focus without destroying a draft when a native file picker returns", async () => {
  vi.stubGlobal("fetch", async (path: string) =>
    path === "/api/bff/auth/session"
      ? Response.json(user)
      : path === "/api/bff/accounts/business"
        ? Response.json(null)
        : Response.json(
            { code: "forbidden", message: "forbidden", request_id: "test" },
            { status: 403 },
          ),
  );
  setup();
  const field = await screen.findByLabelText(messages.accounts.business.fields.name, {
    exact: true,
  });
  fireEvent.change(field, { target: { value: "Unsubmitted business" } });
  act(() => window.dispatchEvent(new Event("focus")));
  await waitFor(() =>
    expect(
      screen.getByLabelText(messages.accounts.business.fields.name, { exact: true }),
    ).toHaveProperty("value", "Unsubmitted business"),
  );
});

it("keeps the real form mounted through background revalidation, network failure and retry", async () => {
  let sessionReads = 0;
  let complete!: (response: Response) => void;
  vi.stubGlobal("fetch", (path: string) => {
    if (path === "/api/bff/auth/session") {
      sessionReads += 1;
      if (sessionReads === 2)
        return new Promise<Response>((resolve) => {
          complete = resolve;
        });
      return Promise.resolve(Response.json(user));
    }
    return Promise.resolve(
      path.endsWith("/business")
        ? Response.json(null)
        : Response.json({ code: "forbidden", request_id: "test" }, { status: 403 }),
    );
  });
  const client = setup();
  const field = await screen.findByLabelText(messages.accounts.business.fields.name, {
    exact: true,
  });
  fireEvent.change(field, { target: { value: "Draft survives authorization check" } });
  field.focus();
  act(() => {
    void client.invalidateQueries({ queryKey: accountKeys.sessions() });
  });
  await waitFor(() => expect(sessionReads).toBe(2));
  expect(field.isConnected).toBe(true);
  expect(field.closest('[aria-hidden="true"]')).not.toBeNull();
  await act(async () => {
    complete(Response.json({ code: "unavailable", request_id: "test" }, { status: 503 }));
  });
  await screen.findByText(messages.accounts.account.unavailable);
  expect(field).toHaveProperty("value", "Draft survives authorization check");
  fireEvent.click(screen.getByRole("button", { name: messages.common.retry }));
  await waitFor(() => expect(field.closest('[aria-hidden="true"]')).toBeNull());
  expect(screen.getByLabelText(messages.accounts.business.fields.name, { exact: true })).toBe(
    field,
  );
  expect(field).toHaveProperty("value", "Draft survives authorization check");
  expect(sessionReads).toBe(3);
});

it("preserves the real business draft across a cache-clearing pagehide/pageshow cycle", async () => {
  vi.stubGlobal("fetch", async (path: string) =>
    path === "/api/bff/auth/session"
      ? Response.json(user)
      : path.endsWith("/business")
        ? Response.json(null)
        : Response.json({ code: "forbidden", request_id: "test" }, { status: 403 }),
  );
  const client = setup();
  const field = await screen.findByLabelText(messages.accounts.business.fields.name, {
    exact: true,
  });
  fireEvent.change(field, { target: { value: "Retained on restore" } });
  act(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })));
  expect(
    client
      .getQueryCache()
      .getAll()
      .every((q) => q.state.data === undefined),
  ).toBe(true);
  expect(field.isConnected).toBe(true);
  expect(field.closest('[aria-hidden="true"]')).not.toBeNull();
  act(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  await waitFor(() => expect(field.closest('[aria-hidden="true"]')).toBeNull());
  expect(screen.getByLabelText(messages.accounts.business.fields.name, { exact: true })).toBe(
    field,
  );
  expect(field).toHaveProperty("value", "Retained on restore");
});

for (const terminal of ["unauthorized", "different identity"] as const) {
  it(`discards mounted private drafts and cache on ${terminal}`, async () => {
    let reads = 0;
    vi.stubGlobal("fetch", async (path: string) => {
      if (path === "/api/bff/auth/session") {
        reads++;
        return reads === 1
          ? Response.json(user)
          : terminal === "unauthorized"
            ? Response.json({ code: "unauthorized", request_id: "test" }, { status: 401 })
            : Response.json({
                ...user,
                id: "6e1edb9f-3a83-4e59-9878-c1ebcf270c58",
                first_name: "Different",
              });
      }
      return path.endsWith("/business")
        ? Response.json(null)
        : Response.json({ code: "forbidden", request_id: "test" }, { status: 403 });
    });
    const client = setup();
    const field = await screen.findByLabelText(messages.accounts.business.fields.name, {
      exact: true,
    });
    fireEvent.change(field, { target: { value: "Private previous draft" } });
    await act(async () => {
      await client.invalidateQueries({ queryKey: accountKeys.sessions() });
    });
    await waitFor(() => expect(field.isConnected).toBe(false));
    expect(screen.queryByText("Private Person")).toBeNull();
    expect(
      client
        .getQueryCache()
        .getAll()
        .every((q) => q.state.data === undefined),
    ).toBe(true);
  });
}

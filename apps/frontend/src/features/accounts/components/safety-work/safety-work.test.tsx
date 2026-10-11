// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../../messages/en.json";
import { ApiError } from "@/shared/api/unwrap";
import { SafetyWork } from "./safety-work";
vi.mock("../protected-session-boundary/protected-session-context", () => ({
  useProtectedSession: () => ({ authorized: true }),
}));
const { read, write } = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }));
vi.mock("../../api/trust.api", () => ({ readTrust: read, writeTrust: write }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("hides previously loaded case history when live permission is revoked", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let revoked = false;
  read.mockImplementation(async (action: string) => {
    if (action === "work")
      return {
        count: 1,
        results: [
          {
            kind: "suspension",
            target: "f81d4fae-7dec-41d0-a765-00a0c91e6bf6",
            reason: "Case",
            status: "active",
            assigned_to: null,
            commands: [],
            created_at: "2026-09-27T00:00:00Z",
          },
        ],
      };
    if (revoked) throw new ApiError(403, "forbidden");
    return {
      data: {
        details: {},
        history: {
          count: 1,
          results: [
            {
              id: "event",
              actor_id: null,
              action: "suspension.activate",
              reason: "Private case evidence",
              created_at: "2026-09-27T00:00:00Z",
            },
          ],
        },
      },
    };
  });
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" timeZone="UTC" messages={en}>
        <SafetyWork userId="user" owner kind="suspension" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: en.accounts.trust.open }));
  expect(await screen.findByText(/Private case evidence/)).toBeTruthy();
  revoked = true;
  await act(async () => {
    await client.invalidateQueries();
  });
  expect((await screen.findByRole("alert")).textContent).toBe(en.accounts.trust.error);
  expect(
    screen.getByText(/Private case evidence/).closest('[aria-hidden="true"][inert]'),
  ).not.toBeNull();
  expect(screen.queryByRole("heading", { name: en.accounts.trust.history })).toBeNull();
  client.clear();
});

it("lets an operator claim an unassigned case without fetching history, then removes history after reassignment", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let assigned: string | null = null;
  read.mockImplementation(async (action: string) =>
    action === "work"
      ? {
          count: 1,
          results: [
            {
              kind: "suspension",
              target: "f81d4fae-7dec-41d0-a765-00a0c91e6bf6",
              reason: "Unassigned case",
              status: "proposed",
              assigned_to: assigned,
              commands: [],
              created_at: "2026-09-27T00:00:00Z",
            },
          ],
        }
      : {
          data: {
            details: {},
            history: {
              count: 1,
              results: [
                {
                  id: "event",
                  actor_id: null,
                  action: "suspension.propose",
                  reason: "Assigned private history",
                  created_at: "2026-09-27T00:00:00Z",
                },
              ],
            },
          },
        },
  );
  write.mockImplementation(async () => {
    assigned = "user";
  });
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" timeZone="UTC" messages={en}>
        <SafetyWork userId="user" owner={false} kind="suspension" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: en.accounts.trust.open }));
  const claim = await screen.findByRole("button", { name: en.accounts.trust.claim });
  expect(read.mock.calls.some(([action]) => action === "timeline")).toBe(false);
  fireEvent.click(claim);
  expect(await screen.findByText(/Assigned private history/)).toBeTruthy();
  expect(write).toHaveBeenCalledWith(
    "work-claim",
    "f81d4fae-7dec-41d0-a765-00a0c91e6bf6",
    { reason: en.accounts.trust.claimReason },
    "suspension",
  );
  assigned = "another-operator";
  await act(async () => {
    await client.invalidateQueries();
  });
  await waitFor(() => expect(screen.queryByText(/Assigned private history/)).toBeNull());
  client.clear();
});

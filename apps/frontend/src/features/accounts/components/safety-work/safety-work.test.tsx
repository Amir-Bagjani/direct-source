// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../../messages/en.json";
import { ApiError } from "@/shared/api/unwrap";
import { SafetyWork } from "./safety-work";
const read = vi.hoisted(() => vi.fn());
vi.mock("../../api/trust.api", () => ({ readTrust: read, writeTrust: vi.fn() }));
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
  expect(screen.queryByText(/Private case evidence/)).toBeNull();
  client.clear();
});

// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { makeQueryClient } from "@/shared/query/query-client";
import messages from "../../../../../messages/en.json";
import { AccountControls } from "./account-controls";
vi.mock("../protected-session-boundary/protected-session-context", () => ({
  useProtectedSession: () => ({ authorized: true }),
}));
const id = "89a250a1-f4b6-47db-b141-769fe65c2d70";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("locks command and target fields until the write and dependent refetch finish", async () => {
  let releaseWrite!: (response: Response) => void,
    releaseRead!: (response: Response) => void,
    reads = 0;
  const directory = {
    count: 1,
    results: [
      {
        id,
        first_name: "Test",
        last_name: "Owner",
        mobile: "+989123456789",
        is_suspended: false,
        operator: false,
        business: {
          id,
          name: "Test workshop",
          kind: "manufacturer",
          status: "verified",
          phone: "02112345678",
          description: "Test",
          logo: null,
          controlled_access: false,
          first_verified_at: "2026-10-01T00:00:00Z",
          addresses: [],
        },
      },
    ],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn((_path: string, init: RequestInit) => {
      if (init?.method === "POST")
        return new Promise<Response>((resolve) => {
          releaseWrite = resolve;
        });
      reads++;
      return reads === 1
        ? Promise.resolve(Response.json(directory))
        : new Promise<Response>((resolve) => {
            releaseRead = resolve;
          });
    }),
  );
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={makeQueryClient()}>
        <AccountControls userId={id} owner />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  const target = await screen.findByLabelText(messages.accounts.trust.account, { exact: true });
  fireEvent.change(target, { target: { value: id } });
  const command = screen.getByLabelText(messages.accounts.trust.command, { exact: true }),
    reason = screen.getByLabelText(messages.accounts.trust.reason, { exact: true });
  fireEvent.change(reason, { target: { value: "First decision" } });
  fireEvent.click(screen.getByRole("button", { name: messages.accounts.trust.execute }));
  await waitFor(() => expect(target).toHaveProperty("disabled", true));
  expect(command.closest("fieldset")).toHaveProperty("disabled", true);
  await act(async () => releaseWrite(Response.json({ completed: true })));
  await waitFor(() => expect(reads).toBe(2));
  expect(target).toHaveProperty("disabled", true);
  expect(command.closest("fieldset")).toHaveProperty("disabled", true);
  await act(async () => releaseRead(Response.json(directory)));
  await waitFor(() => expect(target).toHaveProperty("disabled", false));
  expect(reason).toHaveProperty("value", "");
  fireEvent.change(command, { target: { value: "suspendBusiness" } });
  fireEvent.change(reason, { target: { value: "Next decision remains" } });
  expect(reason).toHaveProperty("value", "Next decision remains");
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { makeQueryClient } from "@/shared/query/query-client";
import messages from "../../../../../messages/en.json";
import { RegistrationForm } from "./registration-form";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a>,
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setup() {
  const client = makeQueryClient();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={client}>
        <RegistrationForm />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  return client;
}
function fill() {
  const fields = messages.accounts.register.fields;
  for (const [label, value] of [
    [fields.first_name, "Test"],
    [fields.last_name, "Account"],
    [fields.mobile, "۰۹۱۲۳۴۵۶۷۸۹"],
    [fields.password, "A-test-password!"],
  ]) {
    fireEvent.change(screen.getByLabelText(label!), { target: { value } });
  }
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
}

it("validates required fields and consent before any request", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  await screen.findByText(messages.accounts.register.validation.accept_terms);
  expect(screen.getByLabelText("First name").getAttribute("aria-invalid")).toBe("true");
  expect(screen.getByText("+989123456789").getAttribute("dir")).toBe("ltr");
  expect(fetchMock).not.toHaveBeenCalled();
});

it("sends normalized data once, disables pending submission and keeps credentials out of mutation cache", async () => {
  let complete!: (response: Response) => void;
  const fetchMock = vi.fn<typeof fetch>(
    () =>
      new Promise<Response>((resolve) => {
        complete = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const client = setup();
  fill();
  await screen.findByRole("button", { name: "Creating account…" });
  expect(screen.getByRole("button", { name: "Creating account…" }).hasAttribute("disabled")).toBe(
    true,
  );
  const mutation = client.getMutationCache().getAll()[0]!;
  expect(mutation.state.variables).toBeUndefined();
  const [url, init] = fetchMock.mock.calls[0]!;
  expect(url).toBe("/api/bff/auth/register");
  expect(JSON.parse(String(init?.body)).mobile).toBe("+989123456789");
  complete(Response.json({ created: true }, { status: 201 }));
  await screen.findByText("Your account was created");
  expect(screen.queryByLabelText("Password")).toBeNull();
  expect(document.activeElement?.getAttribute("role")).toBe("status");
  expect(JSON.stringify(mutation.state)).not.toContain("A-test-password!");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("localizes rejection, hides raw errors and allows explicit resubmission", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json(
        { code: "registration_rejected", message: "private server detail", request_id: "test" },
        { status: 400 },
      ),
    )
    .mockResolvedValueOnce(Response.json({ created: true }, { status: 201 }));
  vi.stubGlobal("fetch", fetchMock);
  setup();
  fill();
  await screen.findByText(messages.accounts.register.errors.rejected);
  expect(screen.queryByText("private server detail")).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  await waitFor(() => expect(screen.queryByText("Your account was created")).not.toBeNull());
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

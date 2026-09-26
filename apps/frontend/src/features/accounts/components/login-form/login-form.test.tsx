// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { makeQueryClient } from "@/shared/query/query-client";
import messages from "../../../../../messages/en.json";
import { LoginForm } from "./login-form";
const signIn = vi.hoisted(() => vi.fn());
vi.mock("next-auth/react", () => ({ signIn }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a>,
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
function setup() {
  const client = makeQueryClient();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={client}>
        <LoginForm />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  return client;
}
it("validates before login and normalizes Persian mobile digits without caching credentials", async () => {
  let finish!: (result: { ok: boolean; error: string }) => void;
  signIn.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const client = setup();
  fireEvent.click(screen.getByRole("button", { name: messages.accounts.login.submit }));
  await screen.findByText(messages.accounts.login.validation.mobile);
  expect(signIn).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText(messages.accounts.register.fields.mobile), {
    target: { value: "۰۹۱۲۳۴۵۶۷۸۹" },
  });
  fireEvent.change(screen.getByLabelText(messages.accounts.register.fields.password), {
    target: { value: "test-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: messages.accounts.login.submit }));
  const pending = await screen.findByRole("button", { name: messages.accounts.login.pending });
  expect(pending.hasAttribute("disabled")).toBe(true);
  expect(signIn).toHaveBeenCalledWith(
    "credentials",
    expect.objectContaining({
      mobile: "+989123456789",
      redirect: false,
      callbackUrl: "/en/account",
    }),
  );
  expect(client.getMutationCache().getAll()[0]!.state.variables).toBeUndefined();
  finish({ ok: false, error: "private-error" });
  await screen.findByText(messages.accounts.login.error);
  expect(screen.queryByText("private-error")).toBeNull();
  expect(
    JSON.stringify(
      client
        .getMutationCache()
        .getAll()
        .map((entry) => entry.state),
    ).includes("test-password"),
  ).toBe(false);
});

// @vitest-environment jsdom
import { StrictMode, useSyncExternalStore } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DialogTitle } from "@/shared/ui/dialog/dialog";
import { PrivateQueryRegion } from "@/shared/ui/private-query-region/private-query-region";
import { Modal } from "./modal";
import { openModal } from "./modal-history";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({
  useSearchParams: () =>
    new URLSearchParams(
      useSyncExternalStore(
        (notify) => {
          window.addEventListener("popstate", notify);
          window.addEventListener("test:history", notify);
          return () => {
            window.removeEventListener("popstate", notify);
            window.removeEventListener("test:history", notify);
          };
        },
        () => window.location.search,
      ),
    ),
}));

beforeEach(() => {
  history.replaceState({}, "", "/fa");
  history.pushState({}, "", "/en?keep=yes#details");
  // Model Next's pushState/replaceState subscription; jsdom handles actual Back/Forward.
  for (const method of ["pushState", "replaceState"] as const) {
    const original = history[method].bind(history);
    vi.spyOn(history, method).mockImplementation((...args) => {
      original(...args);
      window.dispatchEvent(new Event("test:history"));
    });
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function modal(closeOnBack?: boolean) {
  const historyBehavior = closeOnBack === undefined ? {} : { closeOnBack };
  return (
    <StrictMode>
      <Modal name="example" labelledBy="modal-title" {...historyBehavior}>
        <DialogTitle id="modal-title">Example</DialogTitle>
        <input aria-label="Draft" />
      </Modal>
    </StrictMode>
  );
}

async function traverse(direction: "back" | "forward") {
  await act(async () => {
    const traversed = new Promise<void>((resolve) => {
      window.addEventListener("popstate", () => resolve(), { capture: true, once: true });
    });
    history[direction]();
    await traversed;
  });
}

it("closes on Back by default and reopens on Forward", async () => {
  render(modal());
  act(() => openModal("example", "42"));
  expect(screen.getByRole("dialog", { name: "Example" })).toBeDefined();
  await traverse("back");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(window.location.search).toBe("?keep=yes");
  await traverse("forward");
  expect(screen.getByRole("dialog", { name: "Example" })).toBeDefined();
  expect(window.location.hash).toBe("#details");
});

it("keeps an open private dialog inside the masked region and preserves its draft", async () => {
  const privateView = (masked: boolean) => (
    <PrivateQueryRegion masked={masked} error={masked ? "Unavailable" : undefined} retry={() => {}}>
      {modal()}
    </PrivateQueryRegion>
  );
  const view = render(privateView(false));
  act(() => openModal("example"));
  const dialog = await screen.findByRole("dialog", { name: "Example" });
  const input = screen.getByRole("textbox", { name: "Draft" });
  fireEvent.change(input, { target: { value: "Private unsaved content" } });
  view.rerender(privateView(true));
  expect(dialog.closest('[inert][aria-hidden="true"]')).not.toBeNull();
  expect(screen.getByRole("button", { name: "retry" })).toBeDefined();
  view.rerender(privateView(false));
  expect(await screen.findByRole("textbox", { name: "Draft" })).toBe(input);
  expect((input as HTMLInputElement).value).toBe("Private unsaved content");
});
it("contains a private dialog opened directly by URL from its first mount", async () => {
  history.replaceState({}, "", "/en?modal=example");
  render(
    <PrivateQueryRegion masked={false} error={undefined} retry={() => {}}>
      {modal()}
    </PrivateQueryRegion>,
  );
  const dialog = await screen.findByRole("dialog", { name: "Example" });
  expect(dialog.closest('[aria-hidden="false"]')).not.toBeNull();
});

it("false adds no modal entry: Back reaches the previous page and Forward restores the modal", async () => {
  render(modal(false));
  const entries = history.length;
  act(() => openModal("example", "42"));
  expect(history.length).toBe(entries);
  expect(screen.getByRole("dialog", { name: "Example" })).toBeDefined();
  await traverse("back");
  expect(window.location.pathname).toBe("/fa");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await traverse("forward");
  expect(window.location.pathname).toBe("/en");
  expect(window.location.search).toBe("?keep=yes&modal=example&id=42");
  expect(screen.getByRole("dialog", { name: "Example" })).toBeDefined();
  expect(history.length).toBe(entries);
});

it.each(["close", "escape"])(
  "false: %s dismisses on the current page without navigating",
  async (action) => {
    render(modal(false));
    const entries = history.length;
    act(() => openModal("example", "42"));
    if (action === "close") fireEvent.click(screen.getByRole("button", { name: "close" }));
    else fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(window.location.pathname).toBe("/en");
    expect(window.location.search).toBe("?keep=yes");
    expect(window.location.hash).toBe("#details");
    expect(history.length).toBe(entries);
    await traverse("back");
    expect(window.location.pathname).toBe("/fa");
  },
);

it.each([true, false])("direct modal URL respects closeOnBack=%s", async (closeOnBack) => {
  history.replaceState({}, "", "/en?keep=yes&modal=example&id=42#details");
  const entries = history.length;
  render(modal(closeOnBack));
  expect(screen.getByRole("dialog", { name: "Example" })).toBeDefined();
  expect(history.length).toBe(entries + (closeOnBack ? 1 : 0));
  await traverse("back");
  expect(window.location.pathname).toBe(closeOnBack ? "/en" : "/fa");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

it("uses the prop selected before opening", async () => {
  const view = render(modal());
  view.rerender(modal(false));
  act(() => openModal("example"));
  await traverse("back");
  expect(window.location.pathname).toBe("/fa");
});

it("retains the default modal entry when the open modal's id changes", async () => {
  render(modal());
  act(() => openModal("example", "42"));
  const entries = history.length;
  act(() => openModal("example", "43"));
  expect(history.length).toBe(entries);
  await traverse("back");
  expect(window.location.pathname).toBe("/en");
  expect(window.location.search).toBe("?keep=yes");
});

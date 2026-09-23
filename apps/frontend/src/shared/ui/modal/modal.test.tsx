// @vitest-environment jsdom
import { StrictMode, useSyncExternalStore } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
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
  // jsdom has no native dialog methods; actual focus trapping is covered by Playwright.
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.setAttribute("open", "");
      },
    },
    close: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.removeAttribute("open");
      },
    },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});

function modal(closeOnBack?: boolean) {
  const historyBehavior = closeOnBack === undefined ? {} : { closeOnBack };
  return (
    <StrictMode>
      <Modal name="example" labelledBy="modal-title" {...historyBehavior}>
        <h2 id="modal-title">Example</h2>
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
  expect(screen.getByRole("dialog").hasAttribute("open")).toBe(true);
  await traverse("back");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(window.location.search).toBe("?keep=yes");
  await traverse("forward");
  expect(screen.getByRole("dialog").hasAttribute("open")).toBe(true);
  expect(window.location.hash).toBe("#details");
});

it("false adds no modal entry: Back reaches the previous page and Forward restores the modal", async () => {
  render(modal(false));
  const entries = history.length;
  act(() => openModal("example", "42"));
  expect(history.length).toBe(entries);
  expect(screen.getByRole("dialog").hasAttribute("open")).toBe(true);
  await traverse("back");
  expect(window.location.pathname).toBe("/fa");
  expect(screen.queryByRole("dialog")).toBeNull();
  await traverse("forward");
  expect(window.location.pathname).toBe("/en");
  expect(window.location.search).toBe("?keep=yes&modal=example&id=42");
  expect(screen.getByRole("dialog").hasAttribute("open")).toBe(true);
  expect(history.length).toBe(entries);
});

it.each(["close", "escape"])(
  "false: %s dismisses on the current page without navigating",
  async (action) => {
    render(modal(false));
    const entries = history.length;
    act(() => openModal("example", "42"));
    if (action === "close") fireEvent.click(screen.getByRole("button", { name: "close" }));
    else fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("dialog")).toBeNull();
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
  expect(screen.getByRole("dialog").hasAttribute("open")).toBe(true);
  expect(history.length).toBe(entries + (closeOnBack ? 1 : 0));
  await traverse("back");
  expect(window.location.pathname).toBe(closeOnBack ? "/en" : "/fa");
  expect(screen.queryByRole("dialog")).toBeNull();
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

// @vitest-environment jsdom
import { createRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Spinner } from "@/shared/ui/spinner/spinner";
import { Button } from "./button";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

afterEach(cleanup);

it("defaults to a non-submitting default button and preserves native behavior", () => {
  const onClick = vi.fn();
  const ref = createRef<HTMLButtonElement>();
  render(
    <Button ref={ref} name="confirm" onClick={onClick}>
      Confirm
    </Button>,
  );
  const button = screen.getByRole("button", { name: "Confirm" });
  expect(button.getAttribute("type")).toBe("button");
  expect(button.getAttribute("name")).toBe("confirm");
  expect(button.getAttribute("data-variant")).toBe("default");
  expect(ref.current).toBe(button);
  fireEvent.click(button);
  expect(onClick).toHaveBeenCalledOnce();
});

it("exposes an explicit secondary variant and disabled state", () => {
  render(
    <Button disabled variant="secondary">
      Cancel
    </Button>,
  );
  const button = screen.getByRole("button", { name: "Cancel" });
  expect(button.getAttribute("data-variant")).toBe("secondary");
  expect(button).toHaveProperty("disabled", true);
});

it("marks loading as busy and prevents another activation", () => {
  const onClick = vi.fn();
  render(
    <Button disabled aria-busy onClick={onClick}>
      <Spinner data-icon="inline-start" />
      Save
    </Button>,
  );
  const button = screen.getByRole("button", { name: /Save/ });
  expect(button).toHaveProperty("disabled", true);
  expect(button.getAttribute("aria-busy")).toBe("true");
  expect(screen.getByRole("status", { name: "loading" })).toBeDefined();
  fireEvent.click(button);
  expect(onClick).not.toHaveBeenCalled();
});

// @vitest-environment jsdom
import { createRef } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { Input } from "./input";

afterEach(cleanup);

it("preserves native input props, ref, and the project's component slot", () => {
  const ref = createRef<HTMLInputElement>();
  render(<Input ref={ref} aria-label="Email" autoComplete="email" name="email" required />);
  const input = screen.getByRole("textbox", { name: "Email" });
  expect(ref.current).toBe(input);
  expect(input.getAttribute("name")).toBe("email");
  expect(input.getAttribute("autocomplete")).toBe("email");
  expect(input.getAttribute("data-slot")).toBe("input");
  expect(input).toHaveProperty("required", true);
});

it("exposes disabled and invalid states through native and ARIA attributes", () => {
  render(<Input aria-describedby="field-error" aria-invalid disabled aria-label="Code" />);
  const input = screen.getByRole("textbox", { name: "Code" });
  expect(input).toHaveProperty("disabled", true);
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(input.getAttribute("aria-describedby")).toBe("field-error");
});

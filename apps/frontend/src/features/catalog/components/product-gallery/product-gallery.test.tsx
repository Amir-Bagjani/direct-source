// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, it } from "vitest";
import en from "../../../../../messages/en.json";
import { ProductGallery } from "./product-gallery";

afterEach(cleanup);
function view(images: string[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ProductGallery name="Leather shoe" images={images} />
    </NextIntlClientProvider>,
  );
}
it("selects main images through thumbnails and bounded previous/next controls", () => {
  view(["https://images.test/front.png", "https://images.test/back.png"]);
  const previous = screen.getByRole("button", { name: en.catalog.gallery.previous });
  const next = screen.getByRole("button", { name: en.catalog.gallery.next });
  expect(previous.hasAttribute("disabled")).toBe(true);
  fireEvent.click(next);
  expect(screen.getByRole("img", { name: "Leather shoe" }).getAttribute("src")).toBe(
    "https://images.test/back.png",
  );
  expect(next.hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("status").textContent).toBe("2 of 2");
  fireEvent.click(screen.getByRole("button", { name: "View image 1" }));
  expect(screen.getByRole("img", { name: "Leather shoe" }).getAttribute("src")).toBe(
    "https://images.test/front.png",
  );
  expect(previous.hasAttribute("disabled")).toBe(true);
});
it("renders a meaningful empty gallery without broken images or navigation", () => {
  view([]);
  expect(screen.getByText(en.catalog.imageFallback)).toBeDefined();
  expect(screen.queryByRole("img")).toBeNull();
  expect(screen.queryByRole("button")).toBeNull();
});

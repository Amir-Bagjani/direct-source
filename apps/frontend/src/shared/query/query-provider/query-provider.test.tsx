// @vitest-environment jsdom
import { Suspense } from "react";
import { QueryClientProvider, useSuspenseQuery } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { getQueryClient } from "../query-client";
import { QueryProvider } from "./query-provider";

afterEach(() => {
  cleanup();
  getQueryClient().clear();
});

it("retains the browser client when the provider suspends before its first commit", async () => {
  let resolve: (value: string) => void = () => {};
  const result = new Promise<string>((fulfill) => {
    resolve = fulfill;
  });
  const read = vi.fn(() => result);
  function Consumer() {
    const { data } = useSuspenseQuery({ queryKey: ["suspension"], queryFn: read });
    return <p>{data}</p>;
  }
  const client = getQueryClient();
  render(
    <Suspense fallback={<p>Waiting</p>}>
      <QueryProvider>
        <Consumer />
      </QueryProvider>
    </Suspense>,
  );
  expect(screen.getByText("Waiting")).toBeDefined();
  resolve("Ready");
  expect(await screen.findByText("Ready")).toBeDefined();
  expect(getQueryClient()).toBe(client);
  expect(read).toHaveBeenCalledTimes(1);
  // A second consumer reads the same fresh cache without another request.
  cleanup();
  render(
    <QueryClientProvider client={client}>
      <Consumer />
    </QueryClientProvider>,
  );
  expect(screen.getByText("Ready")).toBeDefined();
  expect(read).toHaveBeenCalledTimes(1);
});

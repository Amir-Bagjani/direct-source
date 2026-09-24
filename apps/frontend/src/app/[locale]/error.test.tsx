// @vitest-environment jsdom
import { Component, Suspense, type ReactNode } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { QueryProvider } from "@/shared/query/query-provider/query-provider";
import { getQueryClient } from "@/shared/query/query-client";
import ErrorPage from "./error";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

afterEach(() => {
  cleanup();
  getQueryClient().clear();
});

// Emulate the framework's error-boundary lifecycle; use the actual query and fallback.
class TestBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    return this.state.error ? (
      <ErrorPage error={this.state.error} retry={() => this.setState({ error: null })} />
    ) : (
      this.props.children
    );
  }
}

it("retries a failed Suspense query and restores content without showing raw error details", async () => {
  const read = vi
    .fn()
    .mockRejectedValueOnce(new Error("private upstream detail"))
    .mockResolvedValue("Recovered");
  function Consumer() {
    const { data } = useSuspenseQuery({
      queryKey: ["error-recovery"],
      queryFn: read,
      retry: false,
    });
    return <p>{data}</p>;
  }
  render(
    <QueryProvider>
      <TestBoundary>
        <Suspense fallback={<p>Pending</p>}>
          <Consumer />
        </Suspense>
      </TestBoundary>
    </QueryProvider>,
    { onCaughtError: () => {} },
  );
  expect(await screen.findByRole("alert")).toBeDefined();
  expect(screen.queryByText("private upstream detail")).toBeNull();
  expect(screen.getByRole("main").id).toBe("main");
  fireEvent.click(screen.getByRole("button", { name: "retry" }));
  expect(await screen.findByText("Recovered")).toBeDefined();
  expect(read).toHaveBeenCalledTimes(2);
});

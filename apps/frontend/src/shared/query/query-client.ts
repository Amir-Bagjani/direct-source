import { environmentManager, QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/shared/api/unwrap";

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 300_000,
        retry: (failureCount, error) =>
          failureCount < 1 && (!(error instanceof ApiError) || error.status >= 500),
        refetchOnWindowFocus: true,
      },
      mutations: { retry: false },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient() {
  // Never share server caches across requests. Keep browser cache through initial suspension.
  if (environmentManager.isServer()) return makeQueryClient();
  return (browserQueryClient ??= makeQueryClient());
}

# Data Fetching Architecture

## Scope and reference

This is the implementation guide linked by root `AGENTS.md`. Foundation remains
foundation: there are no live domain reads, writes, auth handlers or BFF routes yet.
Do not add demo endpoints or scaffold unused feature layers just to demonstrate queries.

Reference: [KevinVandy/react-data-fetching](https://github.com/KevinVandy/react-data-fetching),
reviewed at `c4f6617f3bf6e2fd6b52ec8a5103f132bfb6e5b6` (2026-09-21).
The progression from `1-csr/1-5-vite-react-router-react-query-query-options` to
`4-streaming/4-2-nextjs-rsc-react-query` supplies reusable definitions and explicit
hydration. `4-streaming/4-3-nextjs-rsc-react-query-streaming` supplies browser cache
lifetime and streaming concepts. Its experimental hydration package, direct demo
backend calls, duplicated inline definitions and Server Action writes are not adopted.
The older `3-ssr/3-1-nextjs-ssr` Pages Router example is not our route model.

Use installed Next.js guides in `apps/frontend/node_modules/next/dist/docs/` and
[TanStack advanced SSR guidance](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr)
with the pinned APIs. The installed Query version exposes `environmentManager.isServer()`;
do not copy older environment detection APIs blindly.

## Initial audit (before this change)

| Area                   | Finding                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| TanStack setup         | 5.102.8; shared factory, 60s stale time, 5m GC, one transient query retry, no 4xx/mutation retries.                          |
| QueryClient lifetime   | `useState(makeQueryClient)` per provider; no server singleton. Initial suspension above the provider can discard this cache. |
| Providers              | One QueryProvider in locale layout, inside NextIntlClientProvider.                                                           |
| Query hooks            | No domain `useQuery` or `useSuspenseQuery` consumers.                                                                        |
| Query options          | None yet; first feature must define its own options.                                                                         |
| Keys                   | No domain keys yet; test fixtures only.                                                                                      |
| Server prefetch        | None. Current pages render localized foundation content.                                                                     |
| HydrationBoundary      | None, because there is no backend data to hydrate.                                                                           |
| Suspense               | Header and about-marketplace UI boundaries, not backend streaming.                                                           |
| Axios in components    | None; Axios is not installed. Browser fetch wrapper uses same-origin BFF and no-store.                                       |
| Fetching in effects    | None. Modal effect synchronizes browser history, a valid UI effect.                                                          |
| Duplicated fetching    | None; no separate server transport exists yet.                                                                               |
| Mutations/invalidation | No feature mutations. Retry is already disabled globally.                                                                    |
| Waterfalls             | No backend query waterfall exists to refactor.                                                                               |
| Environment boundaries | No observed violation; browser wrapper is client-marked, server auth is not implemented.                                     |

Gaps: no durable feature recipe, no hydration regression coverage and provider cache
lifetime dependent on placement of Suspense. This change fixes that lifetime and tests
cache isolation, hydration reuse, failed-query exclusion and precise invalidation.
No product/API behavior or contract changes are required.

## Ownership and placement

Keep feature API functions, keys/options and mutation hooks in `features/<domain>`.
Use direct file imports; split into `api/` and `queries/` only when size warrants it.
Derive response DTOs from generated OpenAPI operations and pass an owning Zod schema to
`bffRequest` so every successful network payload is validated; query factories infer
their return type from the validated API function.

The dependency direction is UI → query options/hooks → API functions → request layer.
Use `bffRequest`/`unwrap` and `ApiError`; do not introduce Axios or bypass authentication.
Pass the query function AbortSignal into the API request. The BFF server transport,
refresh coordination and approved endpoint allowlist belong to PRD-01, not this base.

A neutral query-definition module must not import browser-marked or server-only
transports. When transports differ, inject the typed API function into the same options
factory at the environment-specific caller. Keep query keys, inputs, normalization and
freshness in that single factory. Do not serialize the function through RSC props;
server and browser import their own adapters. Never call the browser-relative BFF URL
from RSC, or forward arbitrary cookies/tokens to an upstream URL.

## Query definition recipe

The following is illustrative feature code, not an existing endpoint or product type.
Replace the sample item type with the actual OpenAPI result when implementing its PRD.

```ts
import { queryOptions } from "@tanstack/react-query";

type PublicItem = { id: string; title: string };
type ReadItem = (id: string, signal: AbortSignal) => Promise<PublicItem>;

export const itemKeys = {
  all: ["public-items"] as const,
  detail: (id: string) => [...itemKeys.all, "detail", id] as const,
};

export const itemOptions = (id: string, read: ReadItem) =>
  queryOptions({
    queryKey: itemKeys.detail(id),
    queryFn: ({ signal }) => read(id, signal),
    // Inherits the shared stale time; override here only for a domain reason.
  });
```

Old infrastructure: `useState(makeQueryClient)` owned cache lifetime within the provider.
New infrastructure: `getQueryClient()` returns a stable browser instance and a new
server instance. Server prefetch code uses `makeQueryClient()` per hydration boundary;
reuse that local variable for concurrent reads. There is no process-wide server cache.

Avoid future inline `{ queryKey: ["item", id], queryFn: ... }` copies. Instead use
`itemOptions(id, readItem)` for `useQuery`, `useSuspenseQuery`, `prefetchQuery` and
`fetchQuery`; use `itemKeys.detail(id)` for invalidation. These replace ad hoc patterns,
not existing product queries (none exist yet).

Every input that changes the response belongs in the key: normalized filters,
page/cursor strategy, sort, locale when relevant, and non-secret user/business scope
for private results. Public and price-bearing results need distinct namespaces.
Never put tokens in keys. Use separate keys for finite and infinite queries;
`infiniteQueryOptions` owns initialPageParam/getNextPageParam. Enable dependent queries
only when required inputs exist; independent queries must not wait on each other.

## Rendering and hydration

| Need                                               | Strategy                                                                         |
| -------------------------------------------------- | -------------------------------------------------------------------------------- |
| Data used only on server                           | Async RSC calls a server API function; no client cache needed.                   |
| Initial data later refreshed or mutated in browser | Server options → prefetch → dehydrate → HydrationBoundary → same client options. |
| Interaction/client-only inputs                     | `useQuery` with explicit pending/error/empty states.                             |
| Independent slow sections                          | Async server sections inside meaningful Suspense boundaries.                     |

Conceptual server section (imports and UI depend on the actual feature):

```tsx
const client = makeQueryClient();
await Promise.all([
  client.fetchQuery(itemOptions(firstId, readItemOnServer)),
  client.fetchQuery(itemOptions(secondId, readItemOnServer)),
]);
return (
  <HydrationBoundary state={dehydrate(client)}>
    <ItemDetails id={firstId} />
    <ItemDetails id={secondId} />
  </HydrationBoundary>
);
// ItemDetails imports its browser API adapter itself:
// useSuspenseQuery(itemOptions(id, readItemInBrowser))
```

Use `fetchQuery` when failure must reach server error handling (including authorization
and not-found decisions). `prefetchQuery` intentionally swallows errors; use it only
for optional warmups with a planned client fallback. Client Components also execute
on the server during SSR: do not let a failed prefetch trigger a relative browser-only
request there. For optional browser-only reads use `useQuery` with fetching enabled
only after browser mount, rather than an unprefetched `useSuspenseQuery`.

Wrap the async server section with Suspense in its parent so awaiting critical queries
does not block unrelated sections. `loading.tsx` is appropriate for route loading;
section fallbacks should be localized existing UI. Use `error.tsx` or a scoped error
boundary; a client Suspense retry flow also needs QueryErrorResetBoundary integration.
Do not render a mutable count in RSC while the list independently revalidates on the
client unless a refresh mechanism deliberately keeps them in sync.

Default dehydration includes successful queries only. Awaiting inside independent
server Suspense sections already permits streaming; no experimental package is needed.
If a feature requires non-awaited prefetch with pending-query dehydration, implement
and test that explicit policy then: include pending queries, keep safe error redaction,
verify promise transport under RSC, and authorize data before starting it. Do not merely
remove `await` with the current success-only policy or JSON-stringify pending promises.

Only browser-authorized data may enter a dehydrated cache, including its keys and meta.
Use a dedicated boundary client to avoid serializing unrelated data. No JWT, private
credentials or raw error payloads in HTML/RSC. No cache persistence in browser storage.
Session/logout transitions must cancel in-flight queries and clear the cache before
showing the new identity; this is an acceptance requirement for PRD-01.

## Writes and cache coordination

Define a feature mutation hook or reusable mutation options beside the query definitions.
The mutation calls an API function; on success set a detail cache from an authoritative
response or await targeted invalidation, for example:

```ts
await queryClient.invalidateQueries({ queryKey: itemKeys.detail(id), exact: true });
```

Also invalidate the affected list prefix when membership/order changes; do not clear
unrelated domains. Use mutation pending/error state, not duplicate React state. Keep
form drafts locally only when deliberately editing a snapshot. Optimistic updates
need cancellation, a snapshot and rollback. Writes do not retry without a reviewed
idempotency contract; the existing no-retry default remains.

TanStack invalidation does not invalidate Next.js server caches. Public cache tags and
backend publication/removal revalidation belong to PRD-02. Private priced data, cart,
orders and BFF remain no-store. Preserve the documented public taxonomy/catalog TTLs.

## Verification and limits

Tests cover initial browser suspension, server cache isolation, shared-options hydration
without an immediate duplicate request, targeted invalidation, and exclusion of failed
and pending queries. Real authenticated hydration and streaming E2E belong to the first
feature that introduces actual data and must cover both locales and session transitions.
Current modal effects, UI/SEO, API contracts, retry policy and auth gates stay unchanged.
No dependencies, mock product routes, global key registry or generic repository abstraction
are added. Record a technical reason here before introducing an alternative fetching pattern.

### Validation result — 2026-09-21

- Full unit suite: 23 tests passed; after adjusting the test deferred promise to the
  configured TypeScript library target, all 5 query tests passed again.
- `pnpm typecheck`, `pnpm lint` (including architecture checks), and `pnpm build` passed.
- `pnpm format` ran; pre-existing `DESIGN.md` formatting was restored to preserve that
  unrelated document. `pnpm format:check` still fails only on that known legacy file;
  the changed query files pass the targeted Oxfmt check.
- No backend changes or new UI flow; backend and browser E2E were not rerun.

Changed files: root and frontend `AGENTS.md`; this guide and `architecture.md`;
`query-client.ts`, `query-provider.tsx`, `query-client.test.ts` and the new
`query-provider.test.tsx` under `apps/frontend/src/shared/query`.

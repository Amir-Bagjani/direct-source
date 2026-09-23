# Next.js and React Types

## Route files

This project uses Next.js 16.3.5 App Router. Run `next typegen` through `pnpm typecheck`,
then use its global helpers without imports:

- `PageProps<"/[locale]">` for page `params` and `searchParams`.
- `LayoutProps<"/[locale]">` for layout params, children, and future named slots.
- `RouteContext<"/api/.../[id]">` for Route Handler params.

Use `Pick` of these helpers for a nested component that deliberately accepts only route
params. Do not recreate `Promise<{ locale: string }>` or other route declarations by
hand. Route Handlers and Server Actions validate runtime input and authorize requests;
their TypeScript parameter type is not a security boundary.

The project uses next-intl's `createNavigation(routing)` helpers for locale-aware links
and navigation. Derive `AppLocale` and other locale facts from `src/i18n/routing.ts`.
Do not add a second locale union or cast dynamic strings to a Next.js `Route` to silence
navigation errors. `typedRoutes` is not currently enabled because navigation is owned by
next-intl; revisit it only with an integration test and a demonstrated gap.

## Server and client boundaries

Server Components are the default. A client module begins with `"use client"` only for
events, browser APIs, client hooks, or context. Server-only adapters import `server-only`.
Never type a token or secret as a client prop just because its TypeScript shape is valid.

Values crossing from a Server Component to a Client Component must be supported by the
React/Next.js transport. Prefer small serializable view models rather than whole backend
DTOs. Functions cross only through framework-supported Server Action references, and
private errors are reduced to stable public codes.

## React component and hook contracts

Use React's own types for `children`, native attributes, handlers, and refs. React 19
supports refs as props; do not introduce `forwardRef` by habit. Keep props narrow and
prefer composition for meaningful variants. A reusable hook returns the smallest stable
contract its consumers need; infer TanStack Query and React Hook Form result types from
their official APIs instead of wrapping them in duplicate interfaces.

Server state stays in RSC or TanStack Query, URL-addressable state stays in typed locale
navigation/search parameters, form drafts stay in the form owner, and local UI state
stays in the nearest component. A state type belongs to that owner and should prevent
invalid combinations when a discriminated union is clearer than independent booleans.

## Localization

`routing.locales` owns locale literals. Message catalogs remain JSON and the existing
catalog integrity test verifies matching, non-empty leaf keys. Use next-intl APIs for
translation parameters and formatting; do not create a parallel generated-key system
until a real missing-key failure cannot be covered by the current library and tests.

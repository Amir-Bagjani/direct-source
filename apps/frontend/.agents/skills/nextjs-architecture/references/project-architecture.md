# Project Architecture

## Current foundation

The frontend is a foundation-stage application under `apps/frontend`; no PRD flow is
implemented yet. The installed stack is Next.js 16.3.5 App Router, React 19.3, strict
TypeScript (TypeScript 6 package backed by the TypeScript 7 native preview for checking),
React Compiler, next-intl 4.14, TanStack Query 5.102, NextAuth 4.24, React Hook Form,
Zod, native `fetch`, CSS, Vitest/Testing Library, and Playwright. OpenAPI TypeScript is
used for generated API types. Oxlint and Oxfmt are the only linter and formatter.

NextAuth, React Hook Form, and the domain feature directories are installed/planned but
not an excuse to build PRD flows early. Authentication and BFF behavior remain gated by
PRD-01. Catalog/public cache behavior remains PRD-02 work.

## Source ownership

| Location                | Responsibility                                                                                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app`               | Route segments, layouts, route metadata, route loading/error boundaries, and composition. Keep business logic out.                                                   |
| `src/features/<domain>` | Business capability implementation: components, API functions, query definitions, schemas, types, and tests owned by one domain. Create when its PRD is implemented. |
| `src/shared`            | Proven cross-feature primitives and infrastructure. A second independent consumer is the promotion threshold.                                                        |
| `src/server`            | Server request/security policies and secret-bearing adapters. Add `import "server-only"` when a module must never enter a client graph.                              |
| `src/i18n`              | Locale routing, navigation, and request configuration. It stays independent of app/features/server.                                                                  |
| `messages`              | All visible Persian and English copy, with matching keys.                                                                                                            |
| `docs`                  | Product, API, UI/SEO, architecture, ADR, and implementation sources of truth.                                                                                        |

Do not add generic top-level `providers`, `hooks`, `utils`, `types`, `services`, or
`config` directories because a reference architecture shows them. Place a provider or
utility at the narrowest owner; promote it only after real reuse.

## App Router and React boundaries

- Read the relevant installed guide in `node_modules/next/dist/docs/` because this
  version contains APIs and conventions newer than model training.
- Server Components are the default. They may compose feature UI and use server-only
  API adapters without shipping those dependencies to the browser.
- A Client Component is justified by events, browser APIs, React client hooks, or a
  client-only context. Put the boundary around the smallest interactive subtree.
- Do not import a secret-bearing server module into a client graph. Do not pass tokens,
  private errors, or unneeded DTO fields through RSC props.
- Keep `loading.tsx`, `error.tsx`, and Suspense boundaries aligned with meaningful route
  or section recovery. Start independent async work together to avoid waterfalls.
- Route Handlers and Server Actions are trust boundaries. Authenticate and authorize
  them like external endpoints, validate input, and preserve idempotency rules.
- Current locale handling uses `[locale]`, next-intl, and `next/root-params`; do not
  reintroduce deprecated `requestLocale` or `setRequestLocale` patterns.
- The locale root layout validates the versioned theme cookie and server-renders Light or Dark
  directly. Runtime theme state lives on the root `data-theme`; keep local interaction in the
  shared ThemeSwitcher instead of introducing an application-wide client provider.

## Types, validation, and state

- Keep strict checking and avoid `any` outside generated code. Prefer inferred local
  types and explicit contracts where modules meet. The compiler also checks unchecked
  indexed access, exact optional properties, switch fallthrough, missing overrides, and
  type-only ESM imports; use `typescript-architecture` for the detailed policy.
- Generated OpenAPI DTOs describe the API. Use a separate domain/view model only when
  behavior or representation actually differs; do not create duplicate aliases.
- Validate untrusted runtime input at API, form, URL, storage, or third-party boundaries.
  Successful BFF JSON passes an owning Zod schema to `bffRequest`. Keep a schema beside
  its owner unless several independent owners use it.
- Server state belongs to Server Components or TanStack Query, following
  `docs/technical/frontend/data-fetching.md`.
- UI state belongs in the smallest component that coordinates it. URL-addressable state
  stays in the URL. Form drafts use React Hook Form when the form complexity merits it.
- Do not copy query results into React state, fetch routine server state in effects, or
  add a global state library without a cross-feature need that existing React/context,
  URL state, or TanStack Query cannot meet.

## Product-wide invariants

- Visible copy comes from both locale message files. Persian and English behavior ships
  together; use logical CSS properties and locale-aware navigation/formatting.
- Follow `docs/frontend/design.md` for UI and SEO. Public routes require route-specific
  canonical/hreflang metadata. Protected prices and personal data never enter structured
  data.
- Browser requests go through the same-origin BFF. Reuse `ApiError`, `unwrap`, query
  client policies, and future approved auth adapters.
- Keep dependencies pinned through the pnpm lockfile. Prefer platform/CSS/current code
  before adding a package or abstraction.

## Known inconsistencies

Foundation shared components, including the proven Button and Modal primitives, have
dedicated directories within `shared/ui`, `shared/query`, and `shared/seo`, with exclusive
types, helpers, and tests colocated. Keep category-wide query-client and metadata
utilities outside component directories.

`apps/frontend/DESIGN.md` and portions of the generated frontend `AGENTS.md` contain
legacy guidance. The root `AGENTS.md`, current source, `docs/frontend/design.md`, and
`docs/technical/frontend/architecture.md` take precedence. In particular, current code
uses `next/root-params`, not `setRequestLocale`.

# Canonical Feature Architecture

This file owns feature organization for this repository. Other skills link here rather
than inventing another layout. Apply the project-local Ponytail skill at
`apps/frontend/.agent/skills/ponytail/SKILL.md` before frontend work. Explicit project
requirements (shadcn, these directories, strict TypeScript and meaningful existing tests)
take precedence over its generic suggestions for native controls or fewer files/tests.

## Actual source map

Frontend root: `apps/frontend`; alias `@/` resolves to `src/`.

```text
src/
  app/                  Next.js routes, layouts, metadata and thin composition
  features/accounts/
    api/                browser BFF adapters (registration, session, recovery)
    client/             session-events: browser lifecycle communication, not a pure utility
    components/         component directories with exclusive props and tests
    hooks/              use-registration, use-recovery-mutation, use-session-mutations
    queries/            accounts.keys and session query options
    schemas/            login, registration and recovery runtime contracts
    server/             BFF handlers, guard, NextAuth integration and session orchestration
    utils/              pure accounts-specific mobile normalization
  shared/
    api/                bffRequest, unwrap, ApiError, generated OpenAPI
    query/              QueryClient factory, provider, hydration/error infrastructure
    ui/                 official shadcn primitives and proven shared composition
    seo/                metadata and JSON-LD
    theme/              validated light/dark contract
  server/               trusted API configuration, body/request policy and auth vault/transport
  i18n/                 locale routing/navigation/messages
```

There is currently one business feature, accounts. Do not scaffold catalog/profile or
empty folders. `src/shared/hooks/` is the canonical location when a genuinely neutral
hook gains a second independent consumer; `src/shared/utils/` is the equivalent for pure
utilities without another existing category. Neither is needed yet. Do not add parallel
`src/hooks`, `src/utils`, `src/lib`, or `src/components/shared` trees. Existing category
owners (theme, SEO, UI, API) take priority. `src/server` is shared server infrastructure.

## Responsibility rules

| Directory     | Responsibility                                                                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/` | Feature-specific presentation and forms; each component has its own kebab-case directory and exclusive companions.                                 |
| `hooks/`      | Feature-wide React behavior, including mutation hooks. No ordinary utilities disguised as hooks.                                                   |
| `utils/`      | Pure deterministic domain helpers, no hooks, browser effects or server secrets.                                                                    |
| `client/`     | Actual browser-only imperative adapters/events. Do not mislabel them pure utils.                                                                   |
| `api/`        | Feature browser transport adapters reusing bffRequest. HTTP alone does not imply server-only.                                                      |
| `server/`     | Feature server orchestration, authorization and backend integration, protected by server-only. This is not automatically Server Actions.           |
| `queries/`    | The single key factory and query/mutation option definitions. Hook implementations go in hooks/.                                                   |
| `schemas/`    | Runtime validation; inferred schema input/output types stay with their schema.                                                                     |
| `types/`      | Real feature-wide standalone types not already inferred from schemas/generated contracts. Create only when needed.                                 |
| `contracts/`  | Deliberately reviewed cross-feature integration modules only when there is a real consumer. Define implementation/types directly, never re-export. |

Feature roots contain responsibility directories (and optional documentation), not flat
TS/TSX helpers or an index.ts. Component-exclusive hooks/types/tests remain colocated
inside the component directory; this does not require a feature-wide folder for each.
Keep framework-required page/layout/route files under app, never move them into a feature.

## Dependencies and public surfaces

App composes features. Features depend on their own internals and on shared/server/i18n
infrastructure. Shared and server infrastructure must not import features or app. Shared
browser-neutral modules cannot import server. Avoid cycles, including type-only cycles.
Routes may directly import the needed canonical component or server handler. No barrel
files or re-exports. Cross-feature imports must target a small intentional `contracts/`
module, not another feature's components, hooks, schemas or server internals. Prefer app
composition before introducing a cross-feature contract. No such contract exists today.

Use `import "server-only"` in secret-bearing modules. Use `"use client"` at actual browser
boundaries, not `"use server"` as a folder label. No credentials in RSC props, query keys,
mutation variables, storage or UI logs. Type-only imports must not create runtime coupling.

## Query and state ownership

All real query/mutation keys come from `queries/<feature>.keys.ts`.
Accounts owns `accountKeys`; components use `accountKeys.sessions()` for invalidation.
Session options are browser-bound because the API uses same-origin BFF. Do not import
these options into RSC prefetch. For a future SSR feature, use a neutral options factory
with typed injected server/browser adapters as specified by the data-fetching guide.
Keep existing QueryClient lifetimes, cancellation and identity clearing unchanged.

Server state uses TanStack Query/RSC, form drafts use React Hook Form and local UI state
stays in the nearest owner. No fetch-in-effect or copying query data into React state.
Effects for browser events/history remain legitimate. There is no separate installed
React State or TanStack skill: the project data-fetching guide and existing React vendor
skills complement these rules. Locale navigation is `src/i18n/routing.ts` and navigation.ts;
no separate product Route Registry currently exists. Do not invent one during file moves.
Mobile digit normalization remains in accounts/utils until a second independent domain
needs the underlying neutral transformation.

## Before every new file or extraction

1. Read applicable skills, Ponytail, source contracts and the existing owner/consumers.
2. Search for equivalent implementations throughout src, not merely similarly named files.
3. Assign one feature or neutral shared responsibility and the correct directory above.
4. Compare execution environment, auth, error/status mapping, headers, caching, timeout,
   retries and response schema before declaring implementations duplicates.
5. Reuse the existing module; extract only a small stable responsibility with actual
   multiple consumers. Never merge browser and privileged server adapters.
6. Move source and tests together and update all imports/mocks/docs; delete old files only
   after consumers are migrated. Preserve uncommitted user work.

Current consolidation examples: `server/api-config.ts` validates trusted origins for
registration and auth; `server/read-body.ts` reads bounded JSON for multiple handlers;
accounts/server/session-cookie.server.ts clears cookies for logout and password reset.
Registration transport intentionally retains its 201 check, request ID and 10s timeout;
auth transport retains refresh semantics and 8s timeout. Similar fetch syntax is not enough
to justify an unsafe universal wrapper. Small header literals do not need a new framework.

## Correct / incorrect examples

```ts
// Correct: route composes an explicit feature handler.
import { registerAccount } from "@/features/accounts/server/registration.server";
// Correct: component uses the single canonical key factory.
import { accountKeys } from "@/features/accounts/queries/accounts.keys";
// Incorrect: flat root module, or ad hoc query key in a component.
// import { useLogin } from "@/features/accounts/session.queries";
// client.invalidateQueries({ queryKey: ["accounts", "session"] });
// Incorrect: another feature reaching private accounts infrastructure.
// import { currentUser } from "@/features/accounts/server/session.server";
```

## New feature / existing feature workflow

Use CONTEXT/PRD vocabulary and extend the current feature if it owns the lifecycle.
Create only populated responsibility directories. Start from thin app composition, reuse
shared request/query/UI/i18n modules, add one feature key factory, and colocate tests.
For an existing feature, inspect its current adapters and schemas before adding another.
No business changes, UI redesign or new libraries merely to standardize paths.

## Mandatory review and validation

- Ownership and directory match the actual contents; no empty folders or root TS files.
- Shared extraction has real consumers and no feature dependency; private feature imports
  and cycles are absent. No wrapper exists only to rename another wrapper.
- Server-only data cannot enter the client graph; required directives remain intact.
- Keys come from the one factory; request/status/cache/retry/normalization behavior is preserved.
- UI remains shadcn, locale copy and RTL/LTR behavior unchanged; no product contract drift.
- Run focused tests, typecheck, Oxlint (not ESLint), Oxfmt and affected browser journeys.
  Run production build at the refactor checkpoint to verify transitive server/client boundaries.
- Update this reference when conventions actually change; verify all skill links and discovery.

Oxlint enforces layer direction, direct cross-feature contracts, no re-exports, clean feature
roots, no inline real feature keys, direct client-to-server imports and import cycles. Next
build checks the transitive server-only graph. Semantic duplication, extraction quality,
contract suitability and proper hook/utils classification remain mandatory human/agent review;
name matching cannot prove them safely.

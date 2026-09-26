# Frontend architecture refactor — 2026-09-26

Repository: DirectSourcing-Marketplace; frontend: `apps/frontend`; alias: `@/` → `src/`.
The baseline included uncommitted registration, sessions and recovery work. It was
preserved. This change refactors ownership without changing API contracts or product UI.

## Implemented layout

```text
src/
  app/                         routes and composition
  features/accounts/
    api/                       browser adapters
    client/                    session event bridge
    components/                existing component directories and exclusive companions
    hooks/                     registration/recovery/session mutation hooks
    queries/                   accountKeys and session options
    schemas/                   runtime validation and inferred types
    server/                    BFF, guard, NextAuth and session orchestration
    utils/                     mobile normalization
  shared/{api,query,ui,seo,theme}/
  server/{api-config,read-body,request-policy,auth/}
  i18n/
```

`types/` and `contracts/` are reserved for actual standalone types/cross-feature contracts;
none is needed currently. Neutral shared hooks/utilities will use shared/hooks and
shared/utils only when justified; no empty directories or parallel lib tree were added.

## Migration ledger

Paths below are relative to `src/features/accounts`. Tests moved with their owners.
All old root source files were removed after imports/mocks migrated. No compatibility barrels.

| Former root files | Current owner |
| --- | --- |
| registration.api.ts, session.api.ts, recovery.api.ts | api/ |
| registration.schema.ts and test, login.schema.ts, recovery.schema.ts | schemas/ |
| registration.mutations.ts | hooks/use-registration.ts |
| recovery.queries.ts | hooks/use-recovery-mutation.ts |
| session.queries.ts | queries/session.queries.ts; mutation hooks split into hooks/use-session-mutations.ts |
| session-events.ts and test | client/ |
| guard.server.ts | server/ |
| registration.server.ts and test | server/ |
| recovery.server.ts and test | server/ |
| session.server.ts and test | server/ |
| session-bff.server.ts and test | server/ |
| session-cookie.server.ts | server/ |
| nextauth.server.ts | server/ |
| nextauth-handler.server.ts and test | server/ |

25 root files were relocated. Additional responsibility extractions are
utils/normalize-mobile.ts and queries/accounts.keys.ts. Existing component organization
and localized navigation are preserved. Mobile normalization is domain-owned, not global.

## Duplication decisions

| Concern | Result and rationale |
| --- | --- |
| Query/mutation keys | One accountKeys factory; options/hooks and component invalidation reuse it, with identical key values. |
| Trusted web/backend origins | server/api-config.ts shared by registration and auth config. Registration still does not require vault secrets; auth retains HTTPS/secret validation. |
| Bounded JSON request parsing | readJsonBody in existing server/read-body.ts serves registration/recovery; NextAuth keeps text parsing for form-encoded requests. |
| Session cookie expiry | Feature server/session-cookie.server.ts shared by logout/reset with unchanged cookie attributes and success-only clearing. |
| Browser requests/errors | Existing bffRequest/unwrap/ApiError reused; no new universal client or Axios. |
| Server fetch calls | Kept separate: registration requires status 201, request ID and 10s timeout; authenticated transport uses validated auth config and 8s timeout. Their security/status semantics differ. |
| QueryClient construction | Existing shared factory/provider remains authoritative; no feature clients or server singleton. |
| Forms/schema/types | Component-specific drafts/validation messages remain owned; no DTO mapping or form framework added to remove superficial similarities. |
| UI/hook helpers | Existing shadcn, modal history, theme, locale and SEO owners retained; no proven cross-feature hook needed extraction. |

## Permanent skills and discovery

Canonical organization: `apps/frontend/.agents/skills/feature-module-design/SKILL.md`, with
full directory/ownership/extraction/examples/review rules in references/feature-structure.md.
Next.js, TypeScript, testing, design-system and UI-kit skills reference this owner. Outdated
flat-layout and root-contract examples in related references were corrected. The fetching
guide and architecture document now describe implemented paths.

Ponytail comes from the already installed 4.10.0 plugin identified by its Codex manifest:
https://github.com/DietrichGebert/ponytail (Dietrich Gebert, MIT). Its unmodified SKILL.md,
license and source.json SHA-256 are in `apps/frontend/.agent/skills/ponytail/`.
`.agents/skills/ponytail` is a relative discovery symlink, not a second copy. Installation
is a verified local copy, not a package install; optional lifecycle hooks were not installed.
Both root and frontend AGENTS.md require the pre-file workflow and Ponytail. Explicit
project architecture/shadcn/testing requirements override generic minimalism suggestions.
Oxfmt excludes this vendored skill to preserve upstream bytes. A Node test verifies its
hash, discovery target and mandatory instructions.

## Enforcement and limits

Existing Oxlint (not ESLint) now also rejects feature-root source, private cross-feature
imports, direct client-to-server imports and inline feature query/mutation keys. Existing
no-cycle, no-barrel and layer checks remain active. Regression fixtures include valid shared
and contracts imports plus invalid examples. Next build verifies the transitive server-only
graph. No new tooling dependency was added.

Semantic duplication and the suitability of public contracts cannot be safely inferred
from filenames; they remain explicit skill review checks. There is no standalone React
state skill, TanStack skill or product Route Registry in this repository; existing project
fetching/state instructions and next-intl routing remain authoritative.

## Verification

- 127 unit/component tests passed after migration and consolidation. The 19 targeted
  registration/recovery handler tests passed again after preserving stream-error mapping.
- Production build passed, including Next.js route generation and server/client graph checks.
- TypeScript and deprecation checks passed; Oxlint and both architecture/discovery tests passed.
- Oxfmt and git diff whitespace checks passed; project skill relative links resolved.
- Real Django/PostgreSQL registration (2 locales) and sessions (3 tests, two frontend
  processes) passed. Disposable databases isolate these checks from the user's data.
- On continuation, the missing local Ponytail target was detected by the discovery test,
  restored from the same verified plugin, and the test passed again.

No backend implementation or API contract changed in this refactor. Remote CI, staging and
native BFCache release gates have not been newly verified. The existing limitations in
web-sessions.md remain applicable.


Final browser verification: 33 tests passed on production standalone — 26 public/UI,
2 real registration, 3 real session/guard/refresh, and 2 real recovery journeys (Persian
desktop and English mobile). No disposable test_frontend database remained afterward.

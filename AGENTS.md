# DirectSourcing Marketplace — Agent Instructions

## Sources of truth

Read `CONTEXT.md`, the applicable document in `docs/product/prd/`, and the related
requirement/API contract before changing behaviour. Product and API changes must update
their source document and tests in the same change.

Frontend foundation and PRD-01 are implemented: registration/policies, personal-account web
sessions/guards/logout, email verification/recovery, business onboarding and review,
post-verification revisions, controlled access, platform-role controls, user/business suspension,
existing-order disposition and restricted account continuity. The tested scope and native BFCache release limitations are in
`docs/technical/frontend/web-sessions.md`; do not infer business permissions from login.
Implement each PRD separately when requested.
See `docs/technical/frontend/implementation-plan.md` for the sequence and remaining gates.
`docs/technical/frontend/base-readiness.md` records the audited base and mandatory
session/guard/logout gate before any protected feature is enabled.
`CONTEXT.md` is the domain vocabulary. shadcn/ui is the sole design system and UI kit;
`docs/frontend/shadcn.md` records its project integration and official references.

## Frontend implementation skills

Before frontend architecture, module-boundary, shared-component, or structural refactoring
work, read `apps/frontend/.agents/skills/nextjs-architecture/SKILL.md`. Before creating,
extending, or reorganizing a business feature, also read
`apps/frontend/.agents/skills/feature-module-design/SKILL.md`. These project-specific skills
apply the sources of truth below. For feature work, shared components, business logic,
bug fixes, authentication, localization, API contracts, or test changes, also read
`apps/frontend/.agents/skills/testing-architecture/SKILL.md`; meaningful tests are part
of implementation. When creating or modifying components, features, TypeScript types,
API contracts, validation schemas, hooks, or shared abstractions, also read
`apps/frontend/.agents/skills/typescript-architecture/SKILL.md`. Do not assume automatic
activation or duplicate detailed skill rules here.

Before any UI work, read `apps/frontend/.agents/skills/shadcn/SKILL.md`,
`apps/frontend/.agents/skills/design-system-architecture/SKILL.md`,
`apps/frontend/.agents/skills/ui-kit-architecture/SKILL.md`, and
`apps/frontend/components.json`. Use official `@shadcn` components with the configured
Base UI / Nova / neutral preset. Search and install the matching component before
considering custom markup. Compose its existing variants; do not recreate controls,
overlays, cards, forms, or states with hand-written CSS or a competing UI kit.
Tailwind utilities are for layout and documented shadcn composition. The shadcn theme
stylesheet is infrastructure, not a source of bespoke component styles.

Light is the application default even on a dark operating system. Dark is an explicit
persisted user choice. Use the existing SSR-validated theme cookie and shadcn semantic
tokens; do not add a second theme provider, persistence key, or per-component palette.

## Frontend rules

- Reuse installed shadcn components; add only components needed by the current task.
  Avoid speculative abstractions and dependencies outside the approved shadcn stack.
- No barrel files. Do not add `index.ts` merely to re-export module members.
- Oxlint is the frontend linter. Keep `pnpm lint` and its architecture regression checks
  passing; do not reintroduce ESLint or a second linter without an explicit decision.
- Oxfmt is the frontend formatter. Run `pnpm format` to format and `pnpm format:check`
  to verify; leave generated files excluded in `.oxfmtrc.json` untouched.
- Pre-commit uses Husky/lint-staged for staged frontend files. Preserve partial staging;
  never add broad `git add` commands or builds to the hook. Full checks remain in CI.
- Keep routes thin; feature code belongs in `apps/frontend/src/features`. Needed official
  shadcn primitives are shared infrastructure from their first consumer. Other shared
  abstractions in `apps/frontend/src/shared` require a second consumer.
- Browser requests use the same-origin BFF. Never expose Django JWTs to browser JavaScript or
  store them in web storage.
- All visible copy belongs in the locale message files. Use CSS logical properties so RTL/LTR
  does not require JavaScript layout branches.
- React Compiler is enabled by default. Keep dependencies pinned with the pnpm lockfile;
  prefer the latest stable compatible releases over beta/canary.
- Public routes need route-specific canonical/hreflang and SEO metadata. Never expose protected
  prices or user data in structured data. Preview/staging remain noindex.

## Data Fetching Architecture

Before any GET, mutation, pagination/infinite/dependent query, prefetch, SSR/RSC,
Suspense, streaming, cache or invalidation work, read
[`docs/technical/frontend/data-fetching.md`](docs/technical/frontend/data-fetching.md).
The architectural reference is https://github.com/KevinVandy/react-data-fetching,
with priority given to its Next.js RSC/streaming examples; adapt them to our installed
versions and security boundaries rather than copying them literally.

- TanStack Query is the primary client-side server-state synchronization layer.
- Separate feature API functions, reusable `queryOptions` definitions and UI. Keep
  predictable query keys centralized per feature; reuse the same definition for server
  prefetch, `useQuery`/`useSuspenseQuery`, programmatic fetching and invalidation.
- Reuse existing request/auth/error infrastructure. Currently that is native fetch,
  `bffRequest` and `unwrap`, not Axios. No raw fetch/Axios calls in UI components.
- Keep transport differences behind feature API adapters: browser uses same-origin BFF;
  credential-bearing server adapters are server-only. Never import either environment's
  restricted modules into the other or serialize tokens in keys/data/props.
- Use Server Components, prefetch + `HydrationBoundary`, SSR, Suspense and streaming
  intentionally. Server-only data needs no client cache; interaction-only data can use CSR.
- Use `makeQueryClient()` for an isolated server prefetch boundary and the existing
  provider for a stable browser cache. Never create a server singleton or persist private data.
- Avoid request waterfalls; start independent prefetches together (`Promise.all` when
  awaiting them). Choose meaningful section boundaries and explicit loading/error behavior.
- Do not fetch normal server state in `useEffect`, copy query data into React state,
  or duplicate query loading/error state. Form drafts are a valid intentional exception.
- Define mutations beside feature queries and use targeted invalidation/cache updates;
  no automatic mutation retries. Session/logout changes must cancel and clear private cache.
- New features follow these rules. Explain and document a technical reason before deviating.

## Verification

- Do not run `next build` after each task. Run the narrowest relevant test/type/lint command.
- Run a production build only at a phase checkpoint, in CI, or before a release candidate.
- If backend code or an API contract changes, run its targeted tests; run the full backend suite
  only at a checkpoint.


## Mandatory frontend file workflow

Before implementing or modifying frontend code, read and apply
`apps/frontend/.agents/skills/feature-module-design/SKILL.md` (including its canonical
`references/feature-structure.md`) and `apps/frontend/.agent/skills/ponytail/SKILL.md`.
Ponytail defaults to full; its project-local discovery link at `.agents/skills/ponytail`
points to that same installation. Explicit project architecture, shadcn and testing rules
prevail over generic Ponytail suggestions; do not install its optional lifecycle hooks.

Before creating any frontend file: identify the feature/shared owner, search existing modules
and consumers, read applicable skills, choose the responsibility directory, and reuse the
existing implementation. Add an abstraction only when existing modules cannot meet the need.
Keep feature roots free of source files. Use the existing shared categories and `src/server`;
neutral shared hooks/utils belong in `src/shared/hooks` / `src/shared/utils` only when needed.
Do not create parallel lib/hooks/utils trees, duplicate HTTP wrappers or feature barrels.
All real feature keys come from one queries/*.keys.ts factory. Preserve server/client
boundaries and feature encapsulation; cross-feature integration requires an intentional
contracts/ module. Run Oxlint's architecture checks and the appropriate tests.

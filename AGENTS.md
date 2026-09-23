# DirectSourcing Marketplace — Agent Instructions

## Sources of truth

Read `CONTEXT.md`, the applicable document in `docs/product/prd/`, and the related
requirement/API contract before changing behaviour. Product and API changes must update
their source document and tests in the same change.

Current frontend scope is foundation only. Implement each PRD separately when requested.
See `docs/technical/frontend/implementation-plan.md` for the sequence and remaining gates.
`CONTEXT.md` is the domain vocabulary, this file is agent guidance, and
`docs/frontend/design.md` is the living UI/SEO design reference. Do not duplicate them.

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

Before creating feature UI or reusable components, or changing shared UI, CSS, design
tokens, typography, responsive behavior, accessibility, RTL/LTR presentation, Modal
behavior, or UI-library choices, read `docs/frontend/design.md` and
`apps/frontend/.agents/skills/design-system-architecture/SKILL.md`. Reuse established
tokens and components; a new visual language or styling system requires a documented
architecture decision.

The approved foundation uses Tailwind CSS v4 and the official shadcn/ui source workflow.
Before shadcn work, read `apps/frontend/.agents/skills/ui-kit-architecture/SKILL.md`,
`apps/frontend/.agents/skills/shadcn/SKILL.md`, and `apps/frontend/components.json`. The product
design and existing semantic tokens govern generated source; add components only as needed.

Light Theme is the application default; Dark Theme is an explicit persisted user choice. New UI
must support both through the shared semantic tokens. Do not hardcode theme-specific component
colours or introduce another theme provider, persistence mechanism, or token system. Consult
`docs/frontend/design.md` and the `design-system-architecture` Skill before theme-related work.

## Frontend rules

- Use Ponytail: prefer platform, CSS, and existing code before adding a dependency or abstraction.
- No barrel files. Do not add `index.ts` merely to re-export module members.
- Oxlint is the frontend linter. Keep `pnpm lint` and its architecture regression checks
  passing; do not reintroduce ESLint or a second linter without an explicit decision.
- Oxfmt is the frontend formatter. Run `pnpm format` to format and `pnpm format:check`
  to verify; leave generated files excluded in `.oxfmtrc.json` untouched.
- Pre-commit uses Husky/lint-staged for staged frontend files. Preserve partial staging;
  never add broad `git add` commands or builds to the hook. Full checks remain in CI.
- Keep routes thin; keep feature code in `apps/frontend/src/features` and shared primitives in
  `apps/frontend/src/shared` only after a second consumer exists.
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

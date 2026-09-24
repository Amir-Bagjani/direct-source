---
name: nextjs-architecture
description: Apply DirectSourcing Marketplace frontend architecture when designing modules, changing boundaries, creating or modifying shared components, or reviewing Next.js structure. Use feature-module-design for implementation inside one business feature.
---

# Next.js Architecture

Use this skill for application-wide or cross-module frontend decisions. Keep the
current foundation and PRD sequence intact; do not turn an architecture task into a
repository-wide migration.

## Start here

1. Read the root `AGENTS.md`, this frontend's `AGENTS.md`, `CONTEXT.md`, and the
   applicable PRD/requirement/API contract before changing behavior.
2. Read the relevant installed Next.js 16 guide under `node_modules/next/dist/docs/`
   before using framework APIs.
3. Inspect the files and dependency direction that the change actually touches.
4. Use the smallest coherent solution and existing dependencies. Do not scaffold
   speculative layers or add state/data libraries without a demonstrated need.

## Project rules

- Keep routes thin: `src/app` owns routing, layouts, metadata, loading/error
  boundaries, and composition; business implementation belongs in
  `src/features/<domain>`.
- Put a primitive in `src/shared` only after a second independent consumer exists.
  Needed official shadcn primitives are an exception: shared from their first consumer.
  Shared and i18n code cannot depend on features or app routes.
- Reusable and feature components each get a dedicated directory. Colocate every
  file used only by that component. Preserve existing `shared/ui`, `shared/query`,
  and `shared/seo` categories and import each component's canonical file directly.
- Do not create `index.ts` public barrels. This project's Oxlint rules prohibit every
  re-export; consumers import the canonical file directly.
- Prefer Server Components. Add `"use client"` only at the narrow boundary that needs
  browser APIs, events, hooks, or client context. Protect secret-bearing modules with
  `server-only`.
- Preserve the Light-default initialization documented by `design-system-architecture`:
  the locale root layout validates the theme cookie and owns SSR markup, while the small shared
  switcher owns interaction. Do not add an initialization script or broad client provider.
- Preserve strict TypeScript, generated OpenAPI types, runtime validation at trust
  boundaries, bilingual next-intl copy, logical CSS properties, and accessibility. Use
  `typescript-architecture` for type ownership, naming, contracts, and strictness rules.
- Follow the canonical data-fetching guide at
  `../../../../../docs/technical/frontend/data-fetching.md`. Browser traffic uses the
  same-origin BFF; never expose Django JWTs in browser code, storage, props, or caches.
- Keep Oxlint/Oxfmt, React Compiler, pinned dependencies, Vitest/Testing Library, and
  Playwright conventions. Tailwind v4 and shadcn/ui are approved for the UI Kit; follow
  `ui-kit-architecture` and `design-system-architecture`. Do not introduce ESLint, Axios,
  or a global state library merely because another project uses them.
- Tests follow ownership: colocate source tests, keep cross-feature journeys in `tests/`,
  and consult `testing-architecture` for level selection and test implementation.
- Use `design-system-architecture` for shadcn composition and theme integration, typography,
  shared UI APIs, accessibility, RTL/LTR presentation, and responsive behavior.

## Detailed references

- For the current stack, layer ownership, routing, server/client, types, state, i18n,
  SEO, and known gaps, read
  [references/project-architecture.md](references/project-architecture.md).
- Before changing imports, module ownership, aliases, or cross-feature access, read
  [references/dependency-rules.md](references/dependency-rules.md).
- Before creating, moving, or expanding any reusable or feature component, read
  [references/component-architecture.md](references/component-architecture.md).
- For a feature-scoped implementation, also use `feature-module-design`; for test
  design, implementation, reliability, or coverage decisions, use `testing-architecture`;
  for TypeScript design, API/schema contracts, or type errors, use
  `typescript-architecture`; for visible UI and styling, use `design-system-architecture`.

## Finish

Run the narrow relevant tests, `pnpm typecheck`, `pnpm lint`, and a targeted Oxfmt
check. Run a production build only at a documented checkpoint, in CI, for a release
candidate, or when the task explicitly requires it. Review the result against ownership,
dependency direction, server/client boundaries, both locales, and the applicable source
documents.

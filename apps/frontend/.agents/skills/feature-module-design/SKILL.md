---
name: feature-module-design
description: Create, extend, refactor, or review one DirectSourcing Marketplace frontend feature, including its components, API/query integration, schemas, types, tests, route composition, and cross-feature contracts.
---

# Feature Module Design

Use this skill for implementation owned by one business capability. The
`nextjs-architecture` skill defines project-wide boundaries; consult it too when the work
creates shared primitives, changes dependency direction, or establishes a new pattern.

## Workflow

1. Read `CONTEXT.md`, the applicable PRD, requirement, API contract, implementation
   plan, and relevant sections of `docs/frontend/shadcn.md`.
2. Inspect the current route and nearby source. Confirm whether the capability belongs
   to an existing feature or deserves `src/features/<domain>`; do not create a feature
   for a route shell or one generic utility.
3. Assign ownership to every component, API function, query definition, hook, schema,
   type, utility, message key, and test before adding files. Use
   `typescript-architecture` for type placement and boundary contracts.
4. Give every new component a dedicated directory and colocate all files used only by
   it. Do not create `index.ts` barrels.
5. Keep the route thin, choose the narrowest Server/Client Component boundary, and use
   existing API/auth/query/form/i18n infrastructure.
6. Implement the smallest complete PRD slice, including loading, empty, error,
   permission, keyboard, mobile/desktop, Persian/English, and RTL/LTR behavior that
   applies to the slice.
   New feature UI must also support the Light default and explicit Dark theme through the
   semantic tokens defined by `design-system-architecture`; do not add feature theme state.
7. Add tests at the ownership boundary and update product/API/design sources when
   behavior or contracts change.
8. Run focused tests, typecheck, lint, and targeted formatting; review boundaries before
   finishing.

## Detailed references

- Read [references/feature-structure.md](references/feature-structure.md) when choosing
  module/file ownership, public contracts, API/query placement, or component layout.
- Read [references/implementation-workflow.md](references/implementation-workflow.md)
  when implementing or reviewing a complete feature slice and its verification.
- Follow `../../../../../docs/technical/frontend/data-fetching.md` for any server state,
  BFF, query option, hydration, mutation, cache, or streaming work.
- Use `testing-architecture` to choose the smallest meaningful unit, component,
  integration, contract, localization, security, and E2E coverage for the feature.
- Use `typescript-architecture` for component props, DTO/domain/form distinctions,
  runtime schemas, library inference, and server/client type boundaries.
- Use `design-system-architecture` for tokens, shared primitives, component appearance,
  interaction states, accessibility, responsive layout, localization, and RTL/LTR.

Do not migrate unrelated existing files, scaffold hypothetical future layers, or mark a
PRD complete because its folder structure exists.

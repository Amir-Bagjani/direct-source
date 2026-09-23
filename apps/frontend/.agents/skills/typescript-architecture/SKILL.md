---
name: typescript-architecture
description: >
  Design, implement, refactor, and review TypeScript
  contracts for this Next.js project. Use when creating
  or modifying components, features, hooks, API
  integrations, schemas, domain models, shared types,
  generic utilities, or resolving TypeScript errors.
---

# TypeScript Architecture

Use strict TypeScript to express the project's real module and trust boundaries. Preserve
inference inside an owner, and make contracts explicit where components, features, API
data, runtime input, or server/client modules meet.

## Start

1. Read the root and frontend `AGENTS.md`, then use `nextjs-architecture` for module
   boundaries, `feature-module-design` for feature ownership, and `testing-architecture`
   for verification. Use `design-system-architecture` for shared UI APIs and visual,
   responsive, accessibility, and localization contracts.
2. Inspect the owning module, adjacent contracts/tests, `tsconfig.json`, and generated
   OpenAPI types before creating a type or schema.
3. Read the relevant installed Next.js 16 guide under `node_modules/next/dist/docs/`
   before typing framework APIs. Generated `PageProps`, `LayoutProps`, and `RouteContext`
   are the source of truth for route parameters.

## Project rules

- Colocate types at the narrowest owner. One component's public or substantial props
  belong in `<component>.types.ts`; small private implementation shapes may stay in the
  owning file. Feature-wide contracts stay inside that feature. Do not create a global
  `types` directory or a re-exporting barrel.
- Use descriptive PascalCase names without `I` or `T` prefixes. Use interfaces when an
  object contract benefits from extension, and type aliases for unions, tuples, mapped
  types, conditional types, and inferred schema or generated contracts.
- Keep `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noFallthroughCasesInSwitch`, `noImplicitOverride`, and `verbatimModuleSyntax`
  enabled. Use `import type` for type-only imports. Fix errors instead of suppressing
  them with `any`, unsafe assertions, `@ts-ignore`, or `@ts-nocheck`.
- Treat network, URL, form, storage, and third-party values as `unknown` until narrowed
  or parsed. Successful BFF JSON must pass a Zod schema through `bffRequest`; generated
  OpenAPI declarations alone provide no runtime validation.
- Reuse the shared `Theme` union and parser for theme values. The theme cookie is an untrusted
  boundary: accept only `light | dark`, fall back to Light, and do not widen the contract with
  `system` or feature-specific variants.
- Derive DTOs from `src/shared/api/openapi.ts`. Separate DTO, domain model, form input,
  and view model only when their representation or responsibility differs.
- Derive locale identifiers from `src/i18n/routing.ts`. Reuse React, Next.js,
  next-intl, TanStack Query, React Hook Form, and Zod types instead of duplicating them.
- Keep server-only values out of client types and RSC props. Props crossing the RSC
  boundary must be serializable and contain no token, credential, raw private error, or
  unneeded DTO field.
- Prefer a simple union, guard, generic, or `satisfies` expression only when it prevents
  an invalid state or preserves useful inference. Do not build type-level frameworks.

## References

- [references/type-organization.md](references/type-organization.md) — ownership,
  placement, component props, feature contracts, and public surfaces.
- [references/naming-conventions.md](references/naming-conventions.md) — project naming
  for props, DTOs, models, inputs, generics, and utilities.
- [references/type-safety.md](references/type-safety.md) — compiler policy, narrowing,
  optionality, assertions, unions, and type-level tests.
- [references/api-contracts.md](references/api-contracts.md) — OpenAPI extraction, Zod
  validation, DTO/domain separation, BFF responses, and forms.
- [references/nextjs-types.md](references/nextjs-types.md) — Next.js 16 route helpers,
  React 19 props, server/client boundaries, navigation, state, and localization.
- [references/implementation-workflow.md](references/implementation-workflow.md) —
  implementation and verification sequence.

## Finish

Update runtime tests when a contract affects runtime behavior; add type-level tests only
for important non-trivial compile-time APIs. Run the narrow relevant test, then `pnpm
typecheck`, `pnpm lint`, and targeted Oxfmt checks from `apps/frontend`. Do not consider
the work complete while relevant type errors or unsafe trust-boundary casts remain.

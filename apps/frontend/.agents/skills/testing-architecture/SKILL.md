---
name: testing-architecture
description: Design, implement, maintain, or review tests for the DirectSourcing Marketplace Next.js frontend. Use for features, components, bug fixes, API contracts, authentication, localization, Playwright journeys, or test reliability and coverage decisions.
---

# Testing Architecture

Treat meaningful tests as part of implementation. Choose the smallest test level that
can prove the required behavior and add a higher level only when it covers a distinct
boundary or browser risk.

## Start

1. Read the root and frontend `AGENTS.md`, the applicable PRD/contract, and the
   `nextjs-architecture` and `feature-module-design` skills when their scope applies.
   Read `typescript-architecture` when testing a schema, API contract, public generic,
   type guard, or compile-time contract. Read `design-system-architecture` for shared UI,
   CSS/token, accessibility, responsive, visual, direction, or Modal coverage.
2. Inspect tests beside the code and relevant journeys in `tests/` before adding setup,
   mocks, fixtures, helpers, or dependencies.
3. Identify the observable behavior, highest-risk failure, and cheapest level that
   detects it. A bug fix gets a focused regression test when practical.

## Project defaults

- Use Vitest 5 for unit, component, integration, contract, localization, and
  security-policy tests. Component tests use Testing Library with a per-file
  `// @vitest-environment jsdom` directive when DOM behavior is required.
- Use Playwright 1.63 only for cross-route or real-browser behavior: navigation,
  shadcn Dialog/focus, responsive layout, locale routing, and future critical journeys.
- Theme changes follow `design-system-architecture`: test preference parsing at unit
  level, the accessible switcher at component level, and first paint, persistence, client
  navigation, both locales/directions, shared surfaces and reduced motion in Playwright.
- Keep `*.test.ts(x)` beside its owner. Component tests, mocks, fixtures, and helpers
  stay inside the component directory. Keep cross-feature E2E specs in `tests/`.
- Tooling regression tests remain in `tooling/*.test.mjs` and use Node's test runner.
- Use accessible locators and observable outcomes. Avoid private React details, fixed
  sleeps, execution-order dependencies, broad snapshots, and mocks of the behavior
  under test.
- Do not add Jest, Playwright Component Testing, MSW, axe, coverage tooling, page
  objects, or global test utilities until a demonstrated gap justifies their cost.
- Do not invent auth/product tests before the relevant PRD implementation exists.
- Use runtime tests for parsing, narrowing, transformations, and behavior. Add type-level
  tests only when a non-trivial public generic or inference contract needs protection;
  do not add a separate type-testing framework for simple declarations.

## References

- Read [references/testing-strategy.md](references/testing-strategy.md) to select test
  levels, understand current coverage, and place files.
- Read [references/component-integration-testing.md](references/component-integration-testing.md)
  for Testing Library, mocks, contracts, and module-boundary tests.
- Read [references/playwright-e2e.md](references/playwright-e2e.md) for browser journeys,
  selectors, isolation, locale coverage, and authenticated fixtures.
- Read [references/authentication-testing.md](references/authentication-testing.md) when
  implementing PRD-01 sessions, permissions, BFF, or protected operations.
- Read [references/localization-testing.md](references/localization-testing.md) for
  catalog integrity, locale routing, RTL/LTR, formatting, and translated UI.
- Read [references/testing-workflow.md](references/testing-workflow.md) for feature,
  bug-fix, API-contract, and final verification workflows.

## Finish

Run the narrowest affected tests first, then `pnpm test`, `pnpm typecheck`, and `pnpm
lint` when the change affects source. Run `pnpm test:e2e` when browser behavior or an
existing critical journey changes. Report commands actually run, failures, skipped
checks, and remaining risks; never weaken an assertion, add retries, or skip a test to
hide the underlying failure.

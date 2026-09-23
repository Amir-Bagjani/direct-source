# Testing Strategy

## Current system

The frontend uses one runner per purpose:

| Level           | Tool and location                                        | Responsibility                                                                                                                                        |
| --------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit            | Vitest, beside source                                    | Pure logic, validation, transformations, request/cache policies, edge cases.                                                                          |
| Component       | Vitest + Testing Library + jsdom, component directory    | Rendering, interaction, component states, semantic roles, keyboard events available in jsdom.                                                         |
| Integration     | Vitest, beside owning feature/module                     | Cooperation among hooks, query/API adapters, validation and UI without a full browser. It is a test scope, not a separate runner or global directory. |
| End-to-end      | Playwright, `tests/*.spec.ts`                            | Critical route/user journeys and browser behavior that lower levels cannot represent reliably.                                                        |
| Contract/schema | Vitest beside API/schema; OpenAPI generation check in CI | Frontend-dependent response/error/serialization guarantees without duplicating backend coverage.                                                      |
| Localization    | Vitest under `src/i18n`; focused component/E2E coverage  | Catalog shape and keys, request locale selection, translated behavior, locale navigation and direction.                                               |
| Tooling         | Node test runner under `tooling`                         | Lint architecture and pre-commit behavior in isolated temporary repositories.                                                                         |

CI installs the pinned lockfile, regenerates OpenAPI types, runs typecheck, format, lint,
hook tests, Vitest, a production build, Playwright on Chromium, and a container smoke
test. Preserve that sequence unless a measured cost or dependency requires a change.

## Selection rules

- Use a unit test for deterministic branches without rendering.
- Use a component test when DOM output or an interaction is the contract and jsdom can
  model it. Assert through role, label, text, focus, URL, or emitted result.
- Use an integration test when the risk sits between owned modules, such as API error →
  query state → localized UI. Mock only the external boundary.
- Use Playwright when the contract depends on a real browser, Next routing, native
  dialogs/focus, responsive layout, server rendering, or a critical journey.
- Test authorization at the server/BFF boundary. A hidden control is only a UI assertion.
- Avoid repeating the same assertion at every level. A higher-level test must add a
  boundary that lower-level coverage does not prove.

## Placement

Keep source tests beside their owner. Component-exclusive tests/helpers/fixtures/mocks
stay inside its dedicated directory. Feature-wide artifacts stay at the narrowest
feature level. Reusable test infrastructure belongs in shared only after two real,
independent consumers exist. Cross-feature journeys stay under `tests/`; tooling tests
stay under `tooling`.

There are no re-export barrels. Import the canonical source file directly.

## Coverage

No frontend coverage provider or threshold is currently configured. Do not claim a
percentage and do not add a threshold without first collecting a stable baseline with a
justified provider. Review uncovered behaviors during each feature slice, prioritizing
auth/authorization, business rules, validation, mutations, API boundaries, shared
components, and localization. Raw percentage growth is not a reason to test trivial code.

## Current gaps

The foundation has no implemented login, protected route, domain feature, form, live
BFF route, or backend-connected journey. Their tests belong to their PRDs. Automated
axe coverage is absent; current tests cover semantic roles, focus, keyboard behavior,
`lang`/`dir`, and reflow. Add an accessibility engine only when broader UI surfaces make
it materially more useful, while retaining manual keyboard, zoom, contrast, and screen
reader review.

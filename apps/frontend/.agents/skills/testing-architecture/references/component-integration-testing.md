# Component and Integration Testing

## Component tests

Use Testing Library for observable behavior. Add `// @vitest-environment jsdom` only to
files that need DOM APIs; the project-wide Vitest environment stays Node for fast pure
tests. Prefer `getByRole`, `getByLabelText`, and user-visible content. `fireEvent` is the
installed interaction API; do not add `user-event` until realistic event sequencing
reveals a concrete gap.

Native browser behavior that jsdom does not implement must remain explicit. The Modal
test supplies the smallest `HTMLDialogElement` shim to exercise component/history
coordination, while Playwright verifies real dialog visibility, Escape, focus restoration,
Back/Forward, and responsive behavior. Do not make the shim masquerade as native focus
trapping.

Test component states that exist in the API: rendered content, actions, disabled/loading/
empty/error states, keyboard behavior, accessible role/name, and controlled behavior.
Do not invent variants or assert hook calls, internal state, class names, or component
tree structure unless those are the external contract.

## Integration tests

Integration describes the boundary under test, not another directory or runner. Render
the owned feature/component with its real validation, hooks, query definitions, and UI;
replace only remote transport, time, randomness, or framework APIs that prevent a
deterministic test.

- Keep mocks local and restore global stubs after each test.
- Test API functions and security policies without mocking the logic being verified.
- For TanStack Query, create an isolated QueryClient, disable unintended retries through
  the project defaults, clear it after the test, and assert observable cache/request
  behavior.
- Test loading/error/mutation transitions at one useful boundary rather than duplicating
  query-library behavior.
- Use actual generated DTO types; validate runtime schemas with valid, boundary, and
  invalid examples when a frontend schema owns that guarantee.

## Contracts

OpenAPI drift is checked in CI by regenerating `src/shared/api/openapi.ts` and requiring
a clean diff. Frontend tests should cover only behavior the frontend relies upon, such as
safe error parsing, request correlation, serialization, BFF path restrictions, and
response transformations. Backend endpoint semantics remain backend-test responsibility.

# Testing Workflow

## Feature or behavior change

1. Map the change to PRD acceptance criteria and identify risk: business branch,
   component interaction, module boundary, browser journey, contract, locale, access,
   or security policy.
2. Inspect adjacent tests and the closest E2E journey. Select the lowest level that
   proves each distinct risk; do not create one test at every level by default.
3. Place tests with their owner. Reuse local setup only when it reduces real duplication.
4. Implement behavior and applicable success, boundary, invalid, empty/loading/error,
   permission, locale, keyboard, and responsive cases.
5. Update source documents and backend tests when product/API contracts change.

## Bug fix

When practical, first write the smallest test that fails for the reported behavior at
the layer containing the root cause. Fix the shared cause, verify the regression, then
run affected sibling tests. Do not freeze an accidental implementation detail into the
test.

## Commands

Run from `apps/frontend`:

```bash
pnpm exec vitest run path/to/affected.test.ts
pnpm test
pnpm test:hooks
pnpm typecheck
pnpm lint
pnpm exec oxfmt --check <changed paths>
pnpm test:e2e
```

Use the focused Vitest command during iteration. Run the full Vitest suite after source
or shared test-infrastructure changes. `test:hooks` is needed for hook/tooling changes.
Run Playwright for route/browser/E2E changes. Production build remains a checkpoint/CI/
release gate unless the task explicitly requests it.

## Completion review

- Required behavior and meaningful failure paths are covered without duplicated claims.
- Tests are deterministic, independently runnable, and use stable semantic selectors.
- Mocks stop at external/framework boundaries and are restored.
- Component artifacts are colocated; E2E and tooling tests remain in their established
  directories.
- Both catalogs and locale-specific behavior changed together where applicable.
- Protected behavior is rejected at its server/API owner, not only hidden in UI.
- Actual commands and outcomes are reported. Missing infrastructure, credentials,
  coverage data, and unimplemented PRD gaps are stated rather than represented as done.

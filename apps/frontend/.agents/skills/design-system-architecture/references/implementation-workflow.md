# Implementation Workflow

1. Read all of `docs/frontend/design.md`, the applicable PRD, and relevant architecture,
   TypeScript, testing, and Design System references.
2. Inspect the owning UI, CSS tokens, both catalogs, component tests, and browser journey.
3. Separate product behavior from the visual/interaction contract; do not implement
   illustrative features.
4. Reuse an existing semantic token or component. Add a primitive/component token only
   when the canonical design requires a value that has no correct existing role.
5. Keep shared ownership proven, files colocated, direct imports, props native where
   possible, and the client boundary narrow.
6. Implement semantic HTML, localized content, all applicable interaction states, 44px
   targets, visible focus, reduced motion, fluid sizing, logical CSS, and RTL/LTR.
7. Check normal/large text contrast and meaningful boundaries on actual composited
   surfaces. Use text/icons with semantic colors.
8. Add the smallest meaningful component/runtime tests and update an existing Playwright
   journey for browser, direction, focus, responsive, or Modal behavior.
9. Review the rendered result in `/fa` and `/en` at mobile and desktop widths, including
   long text and keyboard use.
10. Run focused tests, full relevant checks, and report remaining gaps distinctly.

From `apps/frontend`:

```bash
pnpm exec vitest run path/to/component.test.tsx
pnpm test
pnpm typecheck
pnpm lint
pnpm exec oxfmt --check <changed paths>
PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e
```

Use the configured Playwright browser in CI; the local Chrome channel is an environment
fallback. Run Storybook or visual regression commands only after those systems are
actually configured. Production build remains a checkpoint/CI/release gate unless the
task explicitly requires it.

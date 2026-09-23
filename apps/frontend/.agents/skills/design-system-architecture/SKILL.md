---
name: design-system-architecture
description: >
  Design, implement, maintain, and review the
  project-specific Design System for this Next.js
  and TypeScript application. Use when creating
  or modifying shared UI components, design
  tokens, CSS, typography, responsive layouts,
  localization-aware interfaces, accessibility,
  or documented UI interaction behavior.
---

# Design System Architecture

Use [`docs/frontend/design.md`](../../../../../docs/frontend/design.md) as the visual,
responsive, bilingual, accessibility, and interaction source of truth. Product PRDs still
own product behavior. Light is the default theme and Dark is an explicit persisted user
choice. Preserve the shared restrained design language; do not create a competing theme
or infer features from illustrative references.

## Start

1. Read the entire design source before UI work, then inspect `src/app/globals.css`, the
   owning component, both message catalogs, and adjacent tests.
2. Use `nextjs-architecture` for module boundaries, `feature-module-design` for feature
   ownership, `typescript-architecture` for contracts, and `testing-architecture` for
   verification. Use the installed `web-design-guidelines` Skill for focused UI audits.
3. Confirm that a shared primitive has two independent consumers or is one of the proven
   foundation primitives. Reuse the existing component and tokens before adding files.

## Project rules

- Keep primitive and semantic CSS custom properties in `src/app/globals.css`. Tailwind v4
  and shadcn/ui map to these same tokens; generated defaults must not replace them.
  Preserve exact primitive values from the design source. Add a component token only for
  a repeated, documented component contract. Follow `ui-kit-architecture` for components.
- Support exactly the `light` and `dark` themes through the root `data-theme` attribute and
  the shared semantic-token contract. Light is the server and failure default; never derive
  the initial choice from `prefers-color-scheme`. Preserve server validation of the versioned
  theme cookie and direct SSR of the root attribute. Do not add another provider, persistence
  key, theme prop, initialization script, or theme-specific component implementation.
- English (`en`) uses Inter and Persian (`fa`) uses Vazirmatn. These are the approved primary
  fonts; do not substitute another primary family without an explicit architecture decision.
  Load variable assets through `next/font` and select them with CSS from the document `lang`.
  Apply locale-aware line-height and tracking rules in CSS. Never add negative letter spacing,
  uppercase, or italic styling to Persian text.
- Build mobile first with logical properties, fluid inline sizes, the 4px spacing rhythm,
  content-driven breakpoints, and at least 44px interactive targets. Test `/fa` RTL and
  `/en` LTR, long copy, mixed-direction values, zoom, and reflow.
- Prefer native semantic HTML. Every interaction needs an accessible name, visible
  `:focus-visible` state, keyboard behavior, adequate contrast, and reduced-motion
  handling. Status meaning uses text or an icon in addition to color.
- Shared UI stays in `src/shared/ui/<component>/` with its types and tests. Import canonical
  files directly; no `index.ts` or re-export barrels. Visible copy stays in both catalogs.
- Preserve the native dialog and its URL/history contract. Do not replace it with a UI
  library unless a measured missing behavior cannot be fixed safely in the owner.
- Do not add MUI or another theme system. Tailwind v4, shadcn/ui and Base UI for future
  composite components are approved; check `components.json` and the official `shadcn`
  skill before adding source. Storybook and extra icon packages remain deferred.

## References

- [references/design-foundations.md](references/design-foundations.md) — visual direction,
  ownership, current foundation, and scope limits.
- [references/design-tokens.md](references/design-tokens.md) — primitive, semantic, and
  component token rules and migration checks.
- [references/theme-architecture.md](references/theme-architecture.md) — Light-default
  ownership, cookie persistence, SSR initialization, component integration, and tests.
- [references/technology-decisions.md](references/technology-decisions.md) — evaluated UI
  libraries, Agent Skills, Storybook, icons, and current decisions.
- [references/typography-and-localization.md](references/typography-and-localization.md) —
  Inter/Vazirmatn, Persian/English, bidi content, and responsive type.
- [references/component-architecture.md](references/component-architecture.md) — shared
  primitive criteria, component APIs, state, styling, and colocation.
- [references/accessibility.md](references/accessibility.md) — WCAG 2.2 AA checks, focus,
  contrast, forms, motion, touch, reflow, and semantic states.
- [references/modal-contract.md](references/modal-contract.md) — native dialog, URL/history,
  dismissal, focus, and required regression coverage.
- [references/testing-and-documentation.md](references/testing-and-documentation.md) —
  component, browser, visual, RTL/LTR, and documentation decisions.
- [references/implementation-workflow.md](references/implementation-workflow.md) — bounded
  implementation and verification sequence.

## Finish

Run focused component tests, `pnpm typecheck`, `pnpm lint`, and targeted formatting. Run
Playwright whenever CSS, responsive behavior, direction, focus, native dialog behavior,
or visible shared UI changes. Review the result in both locales and report unmet design
requirements without representing illustrative or future components as implemented.

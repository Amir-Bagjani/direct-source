---
name: ui-kit-architecture
description: Add, compose or review official shadcn/ui primitives in this frontend.
---

# UI Kit Architecture

The UI kit is shadcn/ui. Read the official `../shadcn/SKILL.md`, `components.json`,
`design-system-architecture`, and `docs/frontend/shadcn.md` before changing UI.
Use `@shadcn` with Base UI / Nova / neutral. Do not build substitute controls with CSS.

- Inspect installed source, run CLI `docs` and read official component documentation.
  Install missing components with the CLI; keep only needed components.
- Move generated files to `src/shared/ui/<component>/<component>.tsx`, update all imports,
  and remove duplicate generated files. No barrels. Needed shadcn primitives are approved
  shared infrastructure from the first consumer.
- Keep shadcn variants, semantic colors and composition. Tailwind classes at consumers
  express layout, not replacement palettes or bespoke visual controls.
- Preserve native props, refs, accessible names, localization, RTL/LTR and keyboard behavior.
  Generated English labels must use the existing locale catalogs. Use DirectionProvider.
- Button defaults to non-submit; compose loading with Spinner, disabled and aria-busy.
  Modal is a URL/history adapter around shadcn Dialog. Preserve its tested history contract.
- Light is the default; Dark is explicit and persisted. All components inherit the same
  shadcn tokens; no new theme state or provider.
- Run relevant tests, typecheck, lint and format checks; Playwright for visible/browser changes.

For file placement and reuse decisions, follow
[the canonical feature structure](../feature-module-design/references/feature-structure.md)
and the mandatory project-local Ponytail workflow in the frontend AGENTS.md.

---
name: ui-kit-architecture
description: Create, extend, or review shared UI primitives in the DirectSourcing Marketplace frontend, including their APIs, states, theme integration, localization, accessibility, and tests.
---

# UI Kit Architecture

Use `docs/frontend/design.md` and `design-system-architecture` for product appearance,
Light/Dark themes, typography, accessibility and responsive behavior. Consult the official
installed `shadcn` skill, current component docs, and `components.json` for CLI, source,
base-specific APIs and aliases. Use `nextjs-architecture` for ownership,
`typescript-architecture` for props, and `testing-architecture` for verification.

Initial inventory: `src/shared/ui/button/button.tsx` (existing public API, adapted),
`src/shared/ui/input/input.tsx` (shadcn source adapted), and
`src/shared/ui/modal/modal.tsx` (native dialog with product URL/history contract).
ThemeSwitcher, LanguageSwitcher, SiteHeader, and Loading remain existing shared UI.
Base UI is selected in `components.json` for future composite shadcn components.
Button keeps `primary | secondary`, default `type="button"`, and the project `loading`
state; Input keeps native form props without a form-library dependency.

- Search current source and requirements before adding a control. Use the official
  shadcn CLI for a needed starting point, review generated CSS/dependencies, then adapt
  the source to the existing owner and remove duplicate generated files.
- Create only proven business-neutral primitives under `src/shared/ui/<component>/`;
  feature-specific controls remain in `src/features/<feature>/`. Add incrementally.
- Preserve native semantics and props, direct canonical imports, colocated types/tests, and the
  smallest client boundary. Do not add barrels or a second styling/theme system.
- Consume the shared semantic CSS tokens. Every primitive supports the Light default and explicit
  Dark theme by inheritance; do not add theme props, read theme persistence, hardcode theme colours,
  create per-theme implementations, or introduce another provider.
- Implement applicable default, hover, active, focus-visible, disabled, loading, selected, error
  and success states with accessible names, 44px targets, keyboard behavior and non-colour cues.
- Keep visible copy in both locale catalogs and test Persian/English, RTL/LTR, reflow and composed
  contrast where the component changes those risks.

Before finishing, run the focused component tests, formatting, typecheck and lint. Run Playwright
when the primitive affects theme switching, native browser behavior, focus, layout or direction.

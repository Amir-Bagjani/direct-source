---
name: design-system-architecture
description: Apply the shadcn/ui design system to shared UI, theme integration, typography, accessibility, responsive layouts, and RTL/LTR in this project.
---

# Design System Architecture

shadcn/ui is the sole design system and UI kit. Read the official sibling
`../shadcn/SKILL.md`, `components.json` from the frontend root, and
[project integration](../../../../../docs/frontend/shadcn.md) before UI work.
Do not create a separate visual specification or bespoke CSS component system.

1. Inspect installed components and the relevant PRD. Use the official `@shadcn`
   registry and the configured Base UI / Nova / neutral preset.
2. Use the shadcn CLI to obtain missing components, then compose their variants.
   Do not recreate controls, dialogs, form groups, cards, or loading states by hand.
3. Keep generated source in `src/shared/ui/<component>/<component>.tsx`; update
   generated imports to canonical paths, with no barrels or duplicate implementations.
   Needed shadcn primitives are approved shared infrastructure from their first consumer.
4. Use Tailwind utilities for layout. Keep component styling in shadcn source, not
   component CSS files, inline visual styles, or global selectors.
5. Use shadcn semantic tokens for both themes. Light is the default; only an explicit
   persisted choice enables Dark. Keep the existing validated SSR cookie integration.
6. Preserve next-intl catalogs, Inter/Vazirmatn, logical utilities, DirectionProvider,
   accessible names, visible keyboard focus, reduced motion and mobile reflow.
7. Preserve the Modal URL/history contract through the shadcn Dialog adapter.
8. Use the architecture, TypeScript and testing skills for boundaries and verification.
   Run focused tests, typecheck, lint and formatting; run Playwright for visible changes.

## References

- [Foundations](references/design-foundations.md)
- [Tokens](references/design-tokens.md)
- [Theme integration](references/theme-architecture.md)
- [Technology decisions](references/technology-decisions.md)
- [Typography and localization](references/typography-and-localization.md)
- [Component architecture](references/component-architecture.md)
- [Accessibility](references/accessibility.md)
- [Modal contract](references/modal-contract.md)
- [Testing](references/testing-and-documentation.md)
- [Workflow](references/implementation-workflow.md)

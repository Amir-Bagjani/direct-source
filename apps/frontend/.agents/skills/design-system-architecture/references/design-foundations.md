# Design Foundations

## Source and direction

`docs/frontend/design.md` is authoritative. Light is the default theme; the original
“mission control behind frosted glass” direction informs the explicit optional Dark Theme.
Both retain restrained surfaces, fine separators, compact information density, blue
interaction accents and light-weight headings. Avoid gradients, loud elevation, saturated
card backgrounds and generic bold-heading styling.

Product PRDs own routes, data, claims, workflows, and content. Illustrative cards, tabs,
logos, tables, and workflow diagrams in the design source do not authorize new features.
`apps/frontend/DESIGN.md` is legacy and does not override the canonical document.

## Current implementation

The global foundation lives in `src/app/globals.css`: primitive tokens, Light/Dark semantic
mappings, locale typography, focus, responsive layout, header, Button, and Modal styling.
`src/app/[locale]/layout.tsx` supplies locale direction, optimized font variables, and the
validated server-rendered theme preference. Shared UI also includes
the ThemeSwitcher alongside Button, Modal, Loading, LanguageSwitcher, and SiteHeader.

There is no general form control, status badge, alert, or table wrapper yet. Create one
when a real feature provides behavior and at least a second independent use justifies
shared ownership. Keep a feature-specific implementation with its feature until then.

## Invariants

- Persian and English ship together; visible text comes from both message catalogs.
- Layout uses CSS logical properties and meaningful DOM order.
- Light primary actions use iris/snow; Dark primary actions use bone/ink.
- New and existing UI supports both themes through semantic tokens, without theme props.
- Green and red are reserved for meaningful success/destructive states and are never the
  sole signal.
- Public marketing width and spacing are references, not constraints for operational
  screens.
- Modal URL/history behavior is a product interaction contract, not a styling detail.
- Accessibility can require a stronger boundary, larger text, or more line-height than an
  illustrative hairline mockup.

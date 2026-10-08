---
name: design-system
description: Route UI design and design-system reviews in DirectSourcing to its existing shadcn, design-system-architecture, and ui-kit-architecture skills. Use before UI composition, theme, typography, token, shared primitive, or RTL/LTR design decisions; this entrypoint defines no second design system.
---

# Design System

This is a routing entrypoint for the project's existing design skills. It does not
replace them or own a parallel token, component, or visual specification.

Before UI work, read:

1. [Design system architecture](../design-system-architecture/SKILL.md) for the
   canonical integration and links to foundations, tokens, theme, localization,
   accessibility, Modal contracts, and verification. Load references relevant to
   the task rather than copying their rules here.
2. [Official shadcn skill](../shadcn/SKILL.md) for component discovery, documentation,
   and composition.
3. [UI kit architecture](../ui-kit-architecture/SKILL.md) for primitive ownership,
   imports, and project adaptations.
4. `apps/frontend/components.json` and `docs/frontend/shadcn.md` from the repository
   root for the actual configured preset and project decisions.

When using [Anthropic frontend-design](../frontend-design/SKILL.md), treat these
project sources as the design brief. Reuse the configured Base UI / Nova / neutral
components, semantic tokens, and Inter/Vazirmatn typography. Express design intent
through content hierarchy and responsive composition. Upstream suggestions about
fresh palettes, fonts, custom CSS, or animation dependencies do not authorize
changes to the project's design system. Keep Light as the default and Dark as an
explicit persisted choice through the existing theme integration.

Use [ecommerce-ux](../ecommerce-ux/SKILL.md) for commerce journey decisions and
[visual-qa](../visual-qa/SKILL.md) for browser evidence. A static UI code audit may
also use the existing [web-design-guidelines](../web-design-guidelines/SKILL.md),
with project decisions taking precedence. Apply the existing architecture and
testing workflows when implementation is requested.

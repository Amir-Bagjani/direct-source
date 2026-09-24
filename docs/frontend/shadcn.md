# shadcn/ui integration

Decision: 2026-09-24. shadcn/ui is the sole design system and UI kit. The former
bespoke visual specifications are retired. Product PRDs still own behavior; SEO,
security and release requirements remain in the technical architecture.

## Source and workflow

- Configuration: `apps/frontend/components.json` — Base UI, Nova style, neutral base,
  Tailwind v4, CSS variables, Lucide and RTL enabled.
- Official skill: `apps/frontend/.agents/skills/shadcn/SKILL.md`, installed with
  `pnpm dlx skills add shadcn/ui --skill shadcn --agent codex --yes` from `apps/frontend`.
  The existing `.agents/skills` location is shared by the project's agent instructions;
  do not create a second `.agent` copy. `skills-lock.json` records the upstream skill.
- Official Markdown snapshots are in [shadcn-upstream](shadcn-upstream/README.md).
  The upstream docs provide theming, composition and configuration guidance rather than
  a standalone downloadable project visual specification.
- Run shadcn commands from `apps/frontend`. Inspect existing source before adding:
  `pnpm dlx shadcn@latest info`, `docs <component>`, `search @shadcn -q <name>`,
  then `add <component>`. Fetch the docs URLs returned by the CLI.
- The project explicitly selects the official `@shadcn` registry. No registry question
  is needed for ordinary UI tasks. New third-party registries require an actual need.
- CLI output goes to `src/shared/ui`. Move components into
  `<component>/<component>.tsx` and update generated imports. The CLI's component list
  does not discover these nested owners; inspect the filesystem too. No duplicate
  implementations or re-export barrels. Source exports from their owning file are valid.

## UI rules

Use installed shadcn components first and install matching components when needed.
Compose built-in variants; do not recreate controls, forms, dialogs, cards, menus or
states with hand-styled elements, CSS Modules, or another kit. Tailwind utilities at
consumers express layout. Component appearance belongs to shadcn source.

The global stylesheet contains the official shadcn neutral tokens, Tailwind mappings,
shadcn utilities and animation imports. It also contains locale font inheritance and
reduced-motion integration. These are required infrastructure, not a custom CSS kit.
The old palette, component selectors and bespoke spacing/radius scales are removed.

Generated source is adapted only for canonical imports, localized strings, non-submit
Button defaults, 44px default touch targets, 16px Input text and Dialog viewport reflow.
Color changes are immediate when switching themes; motion/focus transitions remain.
Inter and Vazirmatn remain self-hosted through next/font. Use DirectionProvider with
the current document direction for Base UI, including portals. Visible copy belongs
in both next-intl catalogs. shadcn installation does not certify accessibility:
verify keyboard operation, names, contrast, reflow and both locales on composed UI.

## Light default and explicit Dark

Light is the first-visit and invalid/missing preference default, even with a dark OS.
The locale layout validates the `directsourcing-theme-v1` cookie and renders `data-theme`
on the root element. ThemeSwitcher uses shadcn ToggleGroup to select Light or Dark.
A valid explicit preference persists across reloads and locale navigation.

The official shadcn theme's light `:root` values are used directly. Its dark values
are bound to `html[data-theme="dark"]`, and the Tailwind dark variant uses that same
selector. Portaled components inherit it. `theme-color` and `color-scheme` follow the
choice. There is no system theme mode or second provider/storage mechanism. The
upstream next-themes example uses a system default; that example is not this project's
configuration and must not be copied unchanged.

## Modal interaction contract

Modal composes shadcn Dialog while preserving the existing URL contract: `modal=<name>`
and optional `id`, preserving unrelated parameters/hash. With `closeOnBack=true`, Back
closes and Forward reopens; direct modal URLs establish a same-page base entry. With
`false`, opening replaces the current entry and Back remains normal browser navigation.
Close and Escape remove modal state. Keep DialogTitle, accessible focus management,
focus restoration and viewport scrolling. Product interaction changes need matching tests.

## Verification

Run component tests, typecheck, lint and formatting. Run Playwright for theme, keyboard,
RTL/LTR, responsive and URL/history behavior. Builds remain phase/CI/release checkpoints.

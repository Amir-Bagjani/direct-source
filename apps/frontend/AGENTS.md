<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project Agent Instructions

## Project Overview
- Next.js (App Router) + TypeScript frontend.
- Bilingual: Persian (`fa`, RTL, default) and English (`en`, LTR).
- i18n library: `next-intl`. Do not introduce any other i18n approach.

## Architecture Skills

Before architectural, module-boundary, shared-component, or structural refactoring work,
read `.agents/skills/nextjs-architecture/SKILL.md`. Before creating, extending, or
reorganizing a business feature, also read
`.agents/skills/feature-module-design/SKILL.md`. These skills are project-specific and
complement the installed vendor skills. For feature work, shared components, business
logic, bug fixes, authentication, localization, API contracts, or test changes, also
read `.agents/skills/testing-architecture/SKILL.md`; meaningful tests are part of the
implementation. For components, features, TypeScript types, API contracts, validation
schemas, hooks, shared abstractions, or TypeScript errors, also read
`.agents/skills/typescript-architecture/SKILL.md`. Automatic activation is not assumed.
Before any UI work, read `.agents/skills/shadcn/SKILL.md`,
`.agents/skills/design-system-architecture/SKILL.md`,
`.agents/skills/ui-kit-architecture/SKILL.md`, `components.json`, and
`../../docs/frontend/shadcn.md`.

## UI source of truth: shadcn/ui

- shadcn/ui is the sole design system and UI kit. Use the official `@shadcn` registry,
  Base UI primitives, Nova style, neutral palette, and built-in variants.
- Check installed components, then use the shadcn CLI to find and add missing controls.
  Do not hand-build substitutes with CSS, CSS Modules, styled divs, or another UI kit.
- Compose shadcn components; use Tailwind utilities for responsive layout. Do not
  override component appearance to reproduce the retired visual system.
- The global stylesheet contains shadcn theme infrastructure and necessary locale,
  accessibility and browser integration only. No feature/component stylesheet system.
- Light is the SSR and failure default, including with a dark OS preference. Dark is
  selected explicitly and persisted by the existing theme cookie. All components inherit
  the same shadcn semantic tokens; no additional theme provider or persistence system.
- PRDs own product behavior; the technical architecture owns SEO and security.

## Implementation Standards
- Prefer Server Components. Add `"use client"` only when interactivity requires it.
- Use `next/image` for images and `next/font` for fonts.
- Mobile-first, responsive layouts using Tailwind responsive utilities.
- Implement all states for interactive elements: hover, focus-visible, active,
  disabled, loading, empty, error.
- Accessibility: semantic HTML, alt text, sufficient contrast, keyboard navigation,
  proper ARIA labels.
- Small reusable components, clear naming, no duplicated styles.

## Bilingual & Bidirectional Rules (fa RTL / en LTR)
Every page and component must work correctly in BOTH directions from the start.
Never build for one direction and "fix" the other later.

### next-intl setup
- Locale is part of the route: `app/[locale]/...`.
- Keep one central routing config (`defineRouting`) with locales `["fa", "en"]` and
  default locale `fa`. Derive everything (direction, fonts, metadata) from it.
  Do not scatter `locale === "fa"` checks across components.
- Use navigation helpers created with `createNavigation` (`Link`, `useRouter`,
  `usePathname`, `redirect`) instead of the ones from `next/link` / `next/navigation`,
  so locale prefixes are handled automatically.
- Translations live in `messages/fa.json` and `messages/en.json`.
  - Server Components: `getTranslations`. Client Components: `useTranslations`.
  - Wrap the app with `NextIntlClientProvider` in the locale layout.
  - Use the installed Next.js 16/next-intl integration with `next/root-params`; do not
    reintroduce deprecated `requestLocale` or `setRequestLocale`. Keep
    `generateStaticParams` where static locale rendering requires it.
- In the root locale layout set `<html lang={locale} dir={direction}>`, where direction
  is derived from the locale (`fa` -> `rtl`, `en` -> `ltr`).
- Follow the installed next-intl version's docs for the middleware/proxy file.

### Text & content
- No hard-coded user-facing strings anywhere. Every string comes from the message files.
- Every key must exist in BOTH `fa.json` and `en.json`. Adding a key to one file
  without the other is a bug.
- Use nested, feature-based keys (e.g. `home.hero.title`) and ICU syntax for plurals
  and variables.
- Write natural Persian, not literal translation. Use proper Persian punctuation
  (، ؛ ؟ «») and the ZWNJ (نیم‌فاصله) where required.
- Format numbers, dates, currency, and relative time with next-intl's
  `useFormatter` / `getFormatter`. Follow the product language requirements and ADR-0011/ADR-0012 for currency and calendar.
- Design for text length differences: no fixed widths on text containers, allow wrapping.

### Layout & CSS
- Use logical Tailwind utilities (`ms-*`, `pe-*`, `start-*`) for layout. Do not add
  hand-written component CSS.
- Never use physical left/right properties when a logical equivalent exists.
- Flex/Grid mirror automatically. Do not fake RTL with `flex-row-reverse`.
- For things that can't be logical (transforms, gradients, shadow offsets, background
  positions), use `rtl:` / `ltr:` variants.
- Directional icons (arrows, chevrons, back/next, breadcrumb separators) must flip in
  RTL. Do NOT flip logos, play/pause icons, clocks, checkmarks, charts, or photos.
- Directional animations (slide-in, drawers, carousels, progress bars, toasts) must
  respect the current direction.
- Use the shared DirectionProvider with the current document direction for shadcn
  Base UI components, including portals.

### Typography
- Use Vazirmatn for Persian and Inter for English, loaded via `next/font` and applied
  through CSS variables based on the locale.
- Line-height, font-size, and weight may differ per script. Preserve Persian glyph readability within shadcn typography.
- Never apply `letter-spacing` to Persian text (it breaks letter joining).
- Never use `uppercase` or italic on Persian text.

### Mixed-direction content
- Numbers, English words, URLs, emails, and phone numbers inside Persian text must
  render correctly. Use `<bdi>` or `dir="auto"` for dynamic/user-generated content.
- Keep code snippets, URLs, and emails `dir="ltr"` even inside RTL pages.

### Language switcher & SEO
- The language switcher keeps the user on the equivalent page in the other locale
  (use next-intl's `usePathname` + `Link`/`router` with the `locale` option).
- Set per-locale metadata (`title`, `description`, Open Graph locale) with
  `generateMetadata`, plus `alternates.languages` for `hreflang`.

## Before Finishing Any Task
Verify shadcn composition and the rules above:
- [ ] Components use shadcn variants and semantic tokens
- [ ] Layout is responsive at all defined breakpoints
- [ ] All interactive states are implemented
- [ ] No bespoke component styling; use shadcn variants
- [ ] Page renders correctly in both `fa` (RTL) and `en` (LTR), with no misalignment
- [ ] No physical left/right classes remain
- [ ] Directional icons and animations flip correctly
- [ ] Correct font and digit style per locale
- [ ] All strings come from next-intl and exist in both `fa.json` and `en.json`
- [ ] Mixed LTR/RTL content (numbers, English words) displays properly

Report the components used and verification performed.

## Data Fetching Architecture

Follow the root [Data Fetching Architecture](../../AGENTS.md#data-fetching-architecture)
and its [implementation guide](../../docs/technical/frontend/data-fetching.md) before
changing fetching, mutations, caching, hydration or streaming. These are the canonical
rules for this frontend; do not establish a separate local pattern.


## Mandatory frontend file workflow

Before implementing or modifying frontend code, read and apply
`.agents/skills/feature-module-design/SKILL.md` (including its canonical
`references/feature-structure.md`) and `.agent/skills/ponytail/SKILL.md`.
Ponytail defaults to full; its project-local discovery link at `.agents/skills/ponytail`
points to that same installation. Explicit project architecture, shadcn and testing rules
prevail over generic Ponytail suggestions; do not install its optional lifecycle hooks.

Before creating any frontend file: identify the feature/shared owner, search existing modules
and consumers, read applicable skills, choose the responsibility directory, and reuse the
existing implementation. Add an abstraction only when existing modules cannot meet the need.
Keep feature roots free of source files. Use the existing shared categories and `src/server`;
neutral shared hooks/utils belong in `src/shared/hooks` / `src/shared/utils` only when needed.
Do not create parallel lib/hooks/utils trees, duplicate HTTP wrappers or feature barrels.
All real feature keys come from one queries/*.keys.ts factory. Preserve server/client
boundaries and feature encapsulation; cross-feature integration requires an intentional
contracts/ module. Run Oxlint's architecture checks and the appropriate tests.

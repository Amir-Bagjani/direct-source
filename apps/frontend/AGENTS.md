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
Before feature UI, reusable/shared components, CSS, tokens, typography, responsive
layouts, accessibility, RTL/LTR presentation, Modal behavior, or UI-library changes,
read `../../docs/frontend/design.md` and
`.agents/skills/design-system-architecture/SKILL.md`. Reuse its tokens and components;
do not introduce another visual language or styling system without a documented decision.
For shared UI primitives, also read `.agents/skills/ui-kit-architecture/SKILL.md`,
`.agents/skills/shadcn/SKILL.md`, and `components.json`.

Light Theme is the application default and Dark Theme is an explicit persisted choice. All UI
supports both through shared semantic tokens. Do not hardcode theme-specific component colours or
introduce another theme provider, persistence mechanism, or token system.

## Source of Truth: frontend design
The repository file `../../docs/frontend/design.md` is the source of truth for visual,
UX, and public SEO decisions. `DESIGN.md` in this directory is a stale legacy copy and
must not drive new work.

### Before any UI work
1. Read `../../docs/frontend/design.md` fully. Re-read the relevant sections whenever you build or edit a
   page, component, or layout, even if you already read it earlier in the session.
2. Follow it exactly: colors, typography, spacing, radius, shadows, breakpoints,
   components, motion, and tone.

### Rules
- Do NOT invent styles. Every visual value must come from `../../docs/frontend/design.md`.
- No hard-coded values. Define design tokens once as CSS variables and use only those tokens.
- Reuse existing components before creating new ones. New components must follow the
  patterns in `../../docs/frontend/design.md`.
- If the design source is silent or ambiguous, ask me, or pick the option most consistent with
  the existing design and state the assumption at the end of your response.
- If my request conflicts with the design source, point out the conflict first and ask which
  should win.
- Never modify the design source unless I explicitly ask. Suggest changes instead.

## Implementation Standards
- Prefer Server Components. Add `"use client"` only when interactivity requires it.
- Use `next/image` for images and `next/font` for fonts.
- Mobile-first, responsive layouts using the breakpoints from `../../docs/frontend/design.md`.
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
  `useFormatter` / `getFormatter`. Follow `../../docs/frontend/design.md` for digit style
  (Persian vs Latin digits) and calendar (Jalali vs Gregorian).
- Design for text length differences: no fixed widths on text containers, allow wrapping.

### Layout & CSS
- Use logical CSS properties such as `margin-inline-start`, `padding-inline-end`, and
  `inset-inline-start`; Tailwind utilities may express these where they follow project tokens.
- Never use physical left/right properties when a logical equivalent exists.
- Flex/Grid mirror automatically. Do not fake RTL with `flex-row-reverse`.
- For things that can't be logical (transforms, gradients, shadow offsets, background
  positions), use `rtl:` / `ltr:` variants.
- Directional icons (arrows, chevrons, back/next, breadcrumb separators) must flip in
  RTL. Do NOT flip logos, play/pause icons, clocks, checkmarks, charts, or photos.
- Directional animations (slide-in, drawers, carousels, progress bars, toasts) must
  respect the current direction.
- When a portaled or direction-sensitive Base UI/Radix component is introduced, use its
  direction provider with the current document `dir` (dropdowns, tabs, sliders, and menus
  depend on it). Native Button, Input, and dialog inherit document direction already.

### Typography
- Each locale uses its own font from `../../docs/frontend/design.md`, loaded via `next/font` and applied
  through CSS variables based on the locale.
- Line-height, font-size, and weight may differ per script. Use the per-locale values
  from `../../docs/frontend/design.md`.
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
Verify against `../../docs/frontend/design.md` and the rules above:
- [ ] Colors, typography, spacing, radius, and shadows match the design tokens
- [ ] Layout is responsive at all defined breakpoints
- [ ] All interactive states are implemented
- [ ] No hard-coded values or one-off styles
- [ ] Page renders correctly in both `fa` (RTL) and `en` (LTR), with no misalignment
- [ ] No physical left/right classes remain
- [ ] Directional icons and animations flip correctly
- [ ] Correct font and digit style per locale
- [ ] All strings come from next-intl and exist in both `fa.json` and `en.json`
- [ ] Mixed LTR/RTL content (numbers, English words) displays properly

Then briefly list which sections of the design source you applied and any assumptions you made.

## Data Fetching Architecture

Follow the root [Data Fetching Architecture](../../AGENTS.md#data-fetching-architecture)
and its [implementation guide](../../docs/technical/frontend/data-fetching.md) before
changing fetching, mutations, caching, hydration or streaming. These are the canonical
rules for this frontend; do not establish a separate local pattern.

# Frontend design system

## Visual direction — shared identity

> Mission control behind frosted glass — weight 400 headlines float over matte-black panels
> lit by thin blue ring-light accents.

Source: the user-supplied **Default — Style Reference** and accompanying `@theme` palette.
The original dark visual direction now defines the optional Dark Theme. **Light Theme is the
default application experience.** Both themes share the same restrained product identity,
typography, spacing, radii, component APIs and semantic token contract. Tailwind CSS and the
official shadcn/ui source workflow are approved for the foundational UI Kit; this does not
authorize product features. PRDs remain the source of product behaviour.

The default Light Theme uses a soft neutral canvas, white content surfaces, restrained separation,
dark text and controlled blue interaction accents. The optional Dark Theme uses layered
dark-neutral surfaces derived from the original palette, softened foregrounds and the established
bone CTA. Avoid gradients, loud decorative shadows, saturated full-card backgrounds, pure-black
dominance and mechanical colour inversion in either theme. Headlines remain light in appearance
(weight 400), not bold.

The supplied `@theme` names and values below take precedence over the reference's conflicting
radius aliases. The malformed background hex `#0b0c0` in the prose means `--color-void`
(`#0b0c0e`). Accessibility, Persian readability and semantic product states take precedence over
decorative mockup details.

## Direction and language

All routes use `/fa` or `/en`. The document `dir` is derived from locale; layout uses CSS
logical properties, never JavaScript direction branches. User-facing copy belongs in the
locale catalogs. Persian dates display Jalali/Tehran at the display boundary; API times remain UTC.

### Approved font system

- Persian (`fa`): **Vazirmatn**
- English (`en`): **Inter**

These are the project's official primary fonts. Do not introduce a different primary font without
an explicit architecture decision. Both use variable files optimized and self-hosted by
`next/font`; the browser does not fetch fonts from an external runtime origin. The implementation
uses locale-aware CSS selectors on the document `lang` attribute, so shared components, native
form controls, tables, navigation and modal content inherit the correct family.

Negative Latin letter spacing and tight display line heights are not applied blindly to Persian;
allow enough room for joined letters, Persian and Latin numerals, diacritics, mixed-language text
and wrapped translations. Navigation and action placement use inline-start/inline-end.

## Responsive baseline

The interface is mobile-first. Content uses fluid inline sizes and grid `minmax`, then adds
breakpoints only when a component cannot remain legible. Touch targets are at least 44px;
tables gain an overflow wrapper rather than a separate data model.

The marketing reference uses a 1080px content maximum, a 72px navigation baseline, 96px section
gaps, and a 4px spacing rhythm. These are reference sizes, not fixed viewport requirements.
Reduce gutters and section spacing on small screens; let navigation grow when translations wrap.
A desktop hero may use a 60/40 split and a feature section a 30/70 split; both stack on mobile.
Keep document order meaningful in both directions. Operational screens may need more width than
the marketing container. Use fluid heading sizes rather than forcing 52–64px text onto phones.

## Tokens and components

The following block preserves the supplied design tokens, including fractional radii and shadow
values. The original `@theme` block documents the primitive values. Tailwind v4 imports its
utilities in the runtime stylesheet and maps shadcn semantic aliases to the existing project
tokens; it does not replace the primitive palette. The frontend maps these values to primitive
custom properties and semantic aliases in
`apps/frontend/src/app/globals.css`. Do not paste this unsupported at-rule into runtime CSS or
silently replace tokens before migrating their consumers.

```css
@theme {
  /* Colors */
  --color-void: #0b0c0e;
  --color-graphite: #131416;
  --color-charcoal: #1f1f21;
  --color-smoke: #3c3d3e;
  --color-steel: #71717a;
  --color-fog: #858687;
  --color-ash: #9d9e9f;
  --color-chalk: #cececf;
  --color-snow: #ffffff;
  --color-bone: #f2f2f2;
  --color-ink: #333333;
  --color-signal-blue: #3b82f6;
  --color-arc-blue: #60a5fa;
  --color-ring-blue: #93c5fd;
  --color-mint: #4ade80;
  --color-fern: #22c55e;
  --color-coral: #f87171;
  --color-ember: #ea580c;
  --color-iris: #314ef0;
  --color-cloud: #f7f8fa;
  --color-mist: #e7e9ee;
  --color-slate: #5f636b;
  --color-night-raised: #292a2d;

  /* Typography */
  --font-inter: 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Typography — Scale */
  --text-body-lg: 14px;
  --leading-body-lg: 1.43;
  --tracking-body-lg: -0.32px;
  --text-body-xl: 16px;
  --leading-body-xl: 1.5;
  --text-subheading: 18px;
  --leading-subheading: 1;
  --tracking-subheading: -0.61px;
  --text-heading: 32px;
  --leading-heading: 1.25;
  --tracking-heading: -0.64px;
  --text-heading-lg: 42px;
  --leading-heading-lg: 1.2;
  --tracking-heading-lg: -0.88px;
  --text-display: 52px;
  --leading-display: 1;
  --tracking-display: -1.3px;
  --text-display-lg: 64px;
  --leading-display-lg: 0.94;
  --tracking-display-lg: -1.28px;

  /* Spacing */
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-28: 28px;
  --spacing-32: 32px;
  --spacing-36: 36px;
  --spacing-48: 48px;
  --spacing-52: 52px;
  --spacing-64: 64px;
  --spacing-68: 68px;
  --spacing-80: 80px;
  --spacing-96: 96px;
  --spacing-116: 116px;

  /* Border Radius */
  --radius-md: 5.26171px;
  --radius-lg: 8.76951px;
  --radius-xl: 12px;
  --radius-2xl: 16px;
  --radius-2xl-2: 20px;
  --radius-3xl: 24px;
  --radius-3xl-2: 30px;

  /* Shadows */
  --shadow-sm: rgba(0, 0, 0, 0.1) 0px 1px 4px 0px, rgba(0, 0, 0, 0.1) 0px 0px 1px 0px;
  --shadow-sm-2: rgba(0, 0, 0, 0.02) 0px 2px 4px 0px, rgba(0, 0, 0, 0.02) 0px 0px 8px 0px;
  --shadow-subtle: rgba(0, 0, 0, 0.25) 0px 1px 2px 0px inset, rgba(0, 0, 0, 0.02) 0px 2px 4px 0px, rgba(0, 0, 0, 0.02) 0px 0px 8px 0px;
  --shadow-subtle-2: rgba(0, 0, 0, 0.04) 0px 0px 0px 1px, rgba(0, 0, 0, 0.06) 0px 1px 1px -0.5px, rgba(0, 0, 0, 0.06) 0px 3px 3px -1.5px;
  --shadow-xl: rgba(0, 0, 0, 0.05) 0px 100px 106px 0px, rgba(0, 0, 0, 0.04) 0px 42px 44px 0px, rgba(0, 0, 0, 0.03) 0px 22px 24px 0px, rgba(0, 0, 0, 0.03) 0px 12px 12px 0px;
  --shadow-xl-2: rgba(0, 0, 0, 0.05) 0px 20px 25px -5px, rgba(0, 0, 0, 0.05) 0px 8px 10px 0px;
  --shadow-sm-3: rgba(0, 0, 0, 0.1) 0px 1px 4px 0px, rgba(0, 0, 0, 0.1) 0px 0px 1px 0px, rgba(255, 255, 255, 0.06) 0px 1px 0px 0px inset;
  --shadow-subtle-3: rgba(59, 130, 246, 0.25) 0px 0px 0px 1.5px;
  --shadow-sm-4: rgba(0, 0, 0, 0.063) 0px 4px 6px 1px, rgba(0, 0, 0, 0.15) 0px 0px 1px 1px;
  --shadow-subtle-4: rgba(0, 0, 0, 0.15) 0px 0px 2px 0px, rgba(0, 0, 0, 0.08) 0px 16px 40px 0px;
  --shadow-sm-5: rgba(34, 197, 94, 0.55) 0px 0px 4px 0px;
  --shadow-sm-6: rgba(59, 130, 246, 0.55) 0px 0px 4px 0px;
}
```

### Theme architecture and semantic use

The application supports exactly `light` and `dark`. Light is the server-rendered and failure
fallback theme. Dark is applied only after explicit user selection; the application never follows
the operating system theme automatically. The valid choice is persisted in the versioned cookie
`directsourcing-theme-v1`. The locale layout validates that server-readable value and renders the
selected `data-theme` directly on `<html>`. The root attribute is the runtime source of truth; the
cookie is persistence only. Missing, invalid or unavailable persistence resolves to Light. This
keeps server markup and React state aligned and prevents an incorrect-theme paint without an
initialization script or hydration-warning suppression.

All shared components consume the same semantic custom properties. They do not accept theme props,
read persistence, or branch on theme in React. `color-scheme` follows the explicit root theme. Native
controls, selection, focus, navigation and dialogs use the same contract. Theme colour changes
apply together without intermediate low-contrast frames; transform feedback remains restrained
and is disabled by the existing reduced-motion rule.

| Responsibility | Light — default | Dark — explicit choice |
| --- | --- | --- |
| Background / subtle background | cloud / bone | graphite / void |
| Surface / raised surface | snow / snow with elevation | charcoal / night-raised |
| Hover / active surface | bone / mist | night-raised / smoke |
| Primary / secondary / muted text | void / ink / slate | bone / chalk / ash |
| Border / strong control border | chalk / steel | steel / ash |
| Link / accent text | iris | arc-blue |
| Focus ring | iris | ring-blue |
| Primary action | iris with snow text | bone with ink text |
| Secondary action | snow with ink text | charcoal with bone text |
| Selection | iris with snow text | arc-blue with void text |

These roles map to `--color-background`, `--color-background-subtle`, `--color-surface`,
`--color-surface-raised`, `--color-surface-hover`, `--color-surface-active`,
`--color-text-primary`, `--color-text-secondary`, `--color-text-muted`, `--color-border`,
`--color-border-strong`, `--color-focus-ring`, `--color-link`, `--color-accent-text`,
`--color-action-primary`, `--color-action-primary-text`, `--color-action-secondary`,
`--color-action-secondary-text`, `--color-selection-background` and
`--color-selection-text` in `globals.css`. Supporting state mappings are:

| Semantic token | Light | Dark |
| --- | --- | --- |
| Primary hover / active | iris mixed with void at 86% / 74% iris | snow / chalk |
| Secondary hover / active | bone / mist | night-raised / smoke |
| Input background / border / placeholder / disabled | snow / steel / slate / mist | charcoal / steel / ash / smoke |
| Success / destructive | fern mixed with void at 65% / coral mixed with void at 66% | mint / coral |
| Navigation opaque / frosted | cloud at 96% / 88% opacity | graphite at 96% / 88% opacity |
| Dialog backdrop | void at 50% opacity | black at 68% opacity |
| Tap highlight | iris at 18% opacity | arc-blue at 20% opacity |

The four added primitives fill concrete gaps in the original dark palette: `cloud` is the soft
Light canvas, `mist` separates Light active/disabled surfaces, `slate` provides readable muted text
on Light surfaces, and `night-raised` separates elevated Dark surfaces without approaching white.
The original primitives remain unchanged. Iris is now assigned to Light primary actions and focus;
ember remains unassigned. Success and destructive colours must always be paired with text or an
icon and verified on their actual composed surfaces.

The visible navigation theme control presents localized Light and Dark choices with native buttons
and `aria-pressed`. An explicit selection persists across reloads, locale navigation and browser
restarts when cookies are available. Persistence failure keeps Light as the predictable default
while a selection can still apply to the current document. Shared components and new feature UI must render
correctly in both themes and must not create another provider, persistence key or token system.

The reference describes green/red both as supporting accents and as status colours. For this
project, reserve them for meaningful success/destructive states, not decoration. Colour alone
must never communicate an order, payment or approval state. Map domain statuses when their PRDs
are implemented; this palette does not define those workflows.

### Typography and density

Body copy is 14–16px; subheadings 18px; headings 32/42px; display headings 52/64px at suitable
widths. The English reference uses Inter variable weights 400, 420, 440, 450, 480, 500 and 580,
with `ss01` and `ss03` stylistic sets when supported by the selected font. Keep large headlines
at 400, avoid 600+ headline styling, and reserve stronger emphasis for useful hierarchy.

The reference's 8–12px labels belong to illustrative mockups, not a default for functional forms,
tables or badges. Keep real controls readable at zoom and with Persian text; prefer 16px input
text. Display line heights and tracking are starting values, not a reason to clip text.

### Component references

These describe appearance for future implementation; they do not request new product components.

| Component | Appearance and constraints |
| --- | --- |
| Primary button | Uses the theme's primary-action tokens: iris/snow in Light and bone/ink in Dark; 10px radius, 8px block / 20px inline padding, 14px weight 400, shadow-sm and a minimum 44px target. A loading action keeps its label, shows a spinner, exposes `aria-busy`, and is disabled until completion. |
| Secondary button / text link | Uses the theme's secondary-action and link tokens, with a visible border, hover/active state and keyboard focus. |
| Input | Native text input semantics with a 44px minimum target, 16px inherited locale type, theme input surface and strong border, visible focus, and `aria-invalid` plus a linked description for errors. |
| Announcement | Uses semantic background/surface tokens and compact spacing; an optional dismiss action has an accessible name and sufficient hit area. |
| Feature card / tabs | Reference card surface #121316, 12px radius, 28px block / 32px inline padding, 8px internal gaps and 16px blue icons; selected tabs have an underline as well as colour. |
| Floating illustrative panel | rgba(21, 22, 24, 0.8), 7px radius and layered shadow-xl; illustrative elevation is not the default for every product card. |
| Status badge | Semantic tint, 1px border, radius-md, 2px / 6px padding, weight 500 and optional dot; increase reference text sizing for actual use. |
| Workflow illustration | Graphite node, radius-lg, 12px padding and 16px icons; this is a visual reference, not a new workflow feature. |
| Navigation | 72px baseline, sticky with a restrained theme-aware frosted surface; logo at inline-start, actions at inline-end. Provide an opaque fallback and enough contrast over scrolling content. |
| Data row | Semantic surface, subtle separator, 8px / 12px padding; readable type and correctly directed numeric content instead of copying tiny mockup labels. |
| Icon tile | White at 3% fill, white at 8% border, radius-lg, 48–64px tile and 24px icon; decorative icons stay hidden from assistive technology. |
| Logo strip | Muted monochrome, 48–64px desktop gaps; only real, approved logos, never invented customer endorsements. |
| Footer | #171717 surface, 48px block padding and white at 7% top border; muted but readable links. |

Use subtle inset highlights to separate stacked surfaces. Decorative borders may be 0.5px;
this does not restrict focus indicators, meaningful control boundaries or badge borders to
hairlines. Large shadows belong to occasional floating illustrations, not ordinary cards.
The supplied blue glow token is an accent, not sufficient proof of an accessible focus state.

The reference uses UI illustrations rather than photography. This is a marketing-art direction,
not a prohibition on marketplace product photographs. Do not copy example CRM content or invent
features, claims, logos or data to reproduce a reference layout.

Shared primitives are limited to buttons, form controls, status badges, alerts, table wrapper and
modal. Adopt shadcn/ui source components incrementally when a real requirement needs them.
The initial UI Kit reuses the existing Button and native Modal and adds Input. Base UI is the
selected shadcn base for future composite components; the native Modal keeps its URL/history
contract. A component becomes shared only after a second feature consumes it, except these
approved foundation controls.

## Modal history and accessibility

Modals have a recognized `modal` query parameter and optional `id`. By default, opening creates
a history entry; Back closes the native `dialog` and Forward reopens it. Direct modal URLs also
establish a same-page base entry in this default mode. Other query parameters are preserved.
The dialog has a programmatic name, keyboard cancel handling, focus restoration and native focus trapping.

`Modal` accepts `closeOnBack?: boolean` (default `true`). Set `closeOnBack={false}` before opening
to replace the current URL without creating a modal history entry: Back navigates normally to
the previous history entry/page. Direct modal URLs in this mode also leave history untouched.
Close and Escape still dismiss the modal on the current page by removing its query parameters.
No popstate interception or navigation blocking is used. With no previous history entry, Back
has its normal browser behaviour. Changing the prop does not retroactively remove an entry
already created while the modal was open.

Verify text contrast on the actual composited surface, including translucent panels: at least
4.5:1 for normal text and 3:1 for large text. Meaningful control boundaries and focus indicators
must remain distinguishable. Retain visible keyboard focus, respect reduced-motion preferences,
and test reflow, zoom and both languages. A token's presence in the palette does not certify its
contrast or accessibility in every combination.

## SEO

The base homepage provides canonical, locale alternates, Open Graph, Twitter metadata and WebSite
JSON-LD. Root robots/sitemap stay non-indexable by default until SEO_INDEXABLE is explicitly true.
Product metadata, public product sitemap entries and Product JSON-LD are added in PRD-02.
Private, operations, account and BFF surfaces must remain noindex. Never include protected wholesale
prices in public metadata or structured data. Base has no catalog or product routes yet.

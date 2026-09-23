# Theme Architecture

## Contract and ownership

The application supports exactly `light` and `dark`. Light is the default for SSR, missing or
invalid preferences, unavailable persistence and first visits. Dark requires explicit user selection;
never inspect or react to the operating system colour preference.

`data-theme` on `<html>` is the live source of truth. The `directsourcing-theme-v1` cookie stores
only a valid explicit choice for later document loads. `src/shared/theme/theme.ts` owns the `Theme`
union, validation, cookie name and document update. Do not add a provider or second persistence
mechanism without an architecture decision that also defines migration and ownership.

The locale layout validates the cookie and server-renders the resolved root attribute. Missing or
invalid values resolve to Light. The same value initializes the ThemeSwitcher server snapshot, so
server markup and hydration agree. A returning Dark user receives Dark in the original response;
do not replace this with a client initialization script or hydration-warning suppression. Reading
the cookie makes the localized application response dynamic, which is the deliberate cost of exact
first paint without duplicate client/server persistence.

## Styling

Primitive values live in `:root`; Light and Dark map the same semantic names under root theme
selectors. Components consume semantic or justified component tokens and inherit theme and
typography. They do not read cookies, branch on theme, accept `theme` props, or duplicate stylesheets.
Tailwind v4's `@theme inline` aliases in `globals.css` resolve shadcn utility names through
these same semantic properties. The CLI's neutral/Geist defaults do not own product colours or
fonts. `dark:` uses the existing root `data-theme="dark"` selector when a future component needs it.
Keep `color-scheme`, browser selection, controls, navigation and dialog surfaces aligned with the
active explicit theme. Apply theme colours together to avoid transient low-contrast frames;
keep interaction motion restrained and respect reduced motion.

Light uses cloud/bone backgrounds, snow surfaces, dark foregrounds, restrained borders and iris
actions. Dark uses graphite/void backgrounds, charcoal/night-raised surfaces, softened bone/chalk
foregrounds and the established bone action. Verify 4.5:1 normal-text, 3:1 large-text and meaningful
control/focus boundaries on the composed surface.

## Verification

Pure tests cover preference parsing. Component tests cover localized choices, pressed
state and persistence. Playwright covers first visit, invalid preference, both selections, reload,
client navigation, keyboard use, both locales/directions, modal state retention, first-paint theme,
computed semantic styles, fonts, reflow and reduced motion. Keep cookies isolated per test.

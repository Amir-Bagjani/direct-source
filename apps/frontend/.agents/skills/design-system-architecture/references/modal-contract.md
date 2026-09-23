# Modal Contract

The project Modal uses native `<dialog>` and URL state. Its component, types, tests, and
history helper live in `src/shared/ui/modal/`. Styling may evolve; the interaction contract
below changes only through an explicit product/design decision and matching tests.

- `modal=<name>` opens a dialog; optional `id` identifies its content. Preserve every
  unrelated query parameter and hash.
- `closeOnBack` defaults to `true`. Opening establishes a same-page history entry; Back
  closes and Forward reopens. A directly opened modal URL first establishes its same-page
  base entry.
- With `closeOnBack={false}`, opening replaces the current URL without adding history.
  Back navigates normally. A direct modal URL leaves history untouched.
- Close and native Escape remove `modal` and `id` on the current page when no modal-owned
  Back entry exists. Do not intercept `popstate` or block navigation.
- Changing `closeOnBack` does not retroactively remove an existing modal entry.
- The dialog has a programmatic label through `aria-labelledby`, native modal semantics
  and focus trapping, keyboard cancel behavior, scroll containment, and focus restoration
  to the previously active trigger.

Keep the close action visible, localized, and at least 44px. Use the theme's raised surface,
documented radius, restrained elevation, distinguishable boundary, and strong backdrop.
Content must reflow within the viewport and remain scrollable when taller than available
space.

Vitest covers history helper/component coordination under jsdom. Playwright is required
for native dialog, Escape, Back/Forward, direct URLs, focus restoration, both locale
directions, and responsive overflow. Do not replace those browser claims with a dialog
shim or snapshot.

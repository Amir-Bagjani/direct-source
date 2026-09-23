# Design Tokens

## Layers

`src/app/globals.css` owns three layers:

1. Primitive tokens copy the exact palette, additional documented Light/Dark neutrals,
   type scale, spacing, fractional radii, and shadows from `docs/frontend/design.md`.
2. The Light and Dark selectors map one semantic contract for background, surface, text,
   border, focus, actions, inputs, selection and browser-native integration.
3. Tailwind v4 `@theme inline` aliases map shadcn utility names to those same semantic
   values. The imported default Tailwind color palette is cleared first. These aliases
   do not define a second theme or replace the local font selectors.
4. Component tokens exist only when a documented value cannot be expressed by a shared
   semantic token. The 10px Button radius is the current example.

Components use semantic or justified component tokens. They do not consume a raw color
because it happens to look correct, except when implementing an explicitly documented
illustrative reference. Unassigned `ember` and `iris` primitives have no product meaning.

## Adding or changing a token

1. Find the exact requirement in the canonical design source.
2. Search all consumers of the existing property.
3. Decide whether the value is primitive, semantic, or component-specific.
4. Verify contrast on the actual composited surface, including alpha layers.
5. Migrate consumers in the same bounded change; do not leave competing aliases.
6. Test both locales, mobile and desktop, focus, disabled/hover/active states, and reduced
   motion where applicable.
7. Update the design source when the design contract itself changes.

Use standard CSS custom properties. Light is the `:root` fallback and explicit
`html[data-theme="light"]` mapping; Dark overrides the same names under
`html[data-theme="dark"]`. The source document's `@theme` block records primitive values;
now documents values that Tailwind v4 consumes through explicit semantic mappings.
Keep `color-scheme` and the Next.js
viewport theme colour aligned with the explicit root theme.

Avoid a component copy of every semantic token or separate theme stylesheet. Avoid hardcoded spacing, radii, colors,
and shadows when an exact token already exists. CSS calculations and `clamp()` may combine
tokens for fluid behavior without creating a second scale.

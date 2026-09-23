# Component Architecture

## Ownership and scope

A shared primitive lives in `src/shared/ui/<component>/` only after two independent
consumers prove it is business-neutral. Buttons, form controls, status badges, alerts,
table wrappers, and Modal are the allowed categories; the list does not require creating
unused components. Feature-specific UI stays in its owning feature.

Each component owns its implementation, substantial/public types, tests, and any private
styles, hooks, utilities, fixtures, or stories. Use lowercase kebab-case files and direct
canonical imports. Do not create `index.ts` barrels. Global tokens and truly shared base
rules remain in `src/app/globals.css`; component CSS can move beside an owner if the global
file stops being the clearest single foundation.

## APIs

- Extend the relevant native React props rather than reproducing DOM attributes.
- React 19 refs are normal props; pass them through when the primitive exposes its node.
- Default Button `type` to `button`; require callers to opt into `submit`.
- Prefer explicit variants such as `primary | secondary` over boolean style matrices.
- Preserve `className`, native disabled state, events, names, labels, and ARIA attributes.
- Keep controlled/uncontrolled modes only when both represent a real use case.
- Use composition for content and layout; do not add a generic slot/render-prop framework
  to a simple primitive.

Every interactive component implements applicable default, hover, active, focus-visible,
disabled, loading, error, empty, and selected states. States must be distinguishable
without color alone. Shared components contain no hardcoded interface copy; consumers
provide localized content or the component reads an established shared namespace.

Prefer semantic native controls. Use headless primitives only for composite interactions
whose keyboard/focus behavior cannot be implemented safely with the platform. Keep the
smallest client boundary and do not turn presentational primitives into client modules
without browser behavior.

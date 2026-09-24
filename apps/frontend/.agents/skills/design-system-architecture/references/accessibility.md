# Accessibility

WCAG 2.2 AA is the project target where applicable. Test the composed component; a token,
native element, or third-party primitive alone does not establish conformance.

## Required checks

- Use native landmarks, headings, links, buttons, labels, tables, and dialogs before ARIA.
- Give controls an accessible name and form fields a programmatic label, name, correct
  input type/mode, autocomplete policy, helper/error association, and actionable errors.
- Preserve keyboard operation, logical focus order, shadcn Dialog focus trapping, dismissal,
  and focus restoration. Sticky UI must not obscure focused content.
- Preserve shadcn focus-visible indicators and verify contrast on composed surfaces.
- Keep interactive targets at least 44 by 44 CSS pixels. Provide hover, active, focus,
  and disabled feedback without relying on color alone.
- Normal text needs at least 4.5:1 contrast and large text 3:1 on the actual opaque or
  composited surface. Control boundaries and meaningful graphics need adequate contrast.
- Respect zoom and 320 CSS-pixel reflow. Use fluid widths, wrapping, logical properties,
  and overflow wrappers for wide tables. Do not disable browser zoom.
- Animate transform/opacity where possible, avoid `transition: all`, keep motion
  interruptible, and honor `prefers-reduced-motion`.
- Announce asynchronous status and validation changes with an appropriate live region.
  Hide decorative icons and give meaningful icons text or an accessible label.

Audit both `/fa` and `/en`, keyboard-only use, long translations, mixed-direction content,
mobile and desktop viewports, and native high-contrast behavior. Existing tests cover
semantic navigation, focus restoration, dialog dismissal, direction, and reflow; add
focused coverage when a component introduces a new risk.

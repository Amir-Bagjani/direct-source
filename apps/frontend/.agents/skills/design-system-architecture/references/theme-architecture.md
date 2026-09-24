# Theme Architecture

Support exactly `light` and `dark`. Light is the first-visit, SSR, invalid-cookie and failure
default, regardless of OS preference. Dark requires explicit user selection.

`src/shared/theme/theme.ts` owns validation and the versioned `directsourcing-theme-v1`
cookie. The locale layout validates that cookie and renders `data-theme` on `<html>`.
ThemeSwitcher composes shadcn ToggleGroup and updates that root attribute and cookie.
The same resolved value initializes the server snapshot to avoid hydration mismatches.
Do not add another provider, persistence key, initialization script or system mode.

Use official shadcn neutral tokens in the global stylesheet. Light tokens live in `:root`;
`html[data-theme="dark"]` overrides them. The Tailwind dark variant targets that attribute,
including portaled content. Components use semantic utilities and built-in variants.
Browser color-scheme and theme-color follow the selected theme. Keep locale font integration
and reduced-motion support. No feature-level theme branches or per-theme components.

Test parsing, accessible choice state, reload, locale navigation, invalid preference,
OS-dark first visits, server first paint, actual surfaces and keyboard behavior.

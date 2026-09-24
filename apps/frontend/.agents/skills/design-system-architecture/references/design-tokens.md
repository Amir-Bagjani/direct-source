# Tokens

Use the official shadcn semantic names (`background`, `foreground`, `primary`, `muted`,
`border`, `input`, `ring`, `card`, `popover`, chart and sidebar tokens) and radius scale.
The global stylesheet is shadcn theme infrastructure, with necessary locale and browser
accessibility integration. It is not a bespoke component styling entry point.
Use built-in variants first. Do not create primitive palettes or per-component CSS files.
When an explicitly requested theme change requires token changes, update both themes and
verify composed contrast. Downloaded official theming documentation is in
`docs/frontend/shadcn-upstream/theming.md`; project integration is in `docs/frontend/shadcn.md`.

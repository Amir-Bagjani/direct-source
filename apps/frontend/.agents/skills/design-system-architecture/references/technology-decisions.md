# UI Technology Decision — 2026-09-24

The user selected shadcn/ui as the sole design system and UI kit. The official registry,
Base UI primitives, Nova style, neutral theme and Tailwind v4 are the approved stack.
The former bespoke visual specification and hand-styled controls are retired.

Use the official skill in `.agents/skills/shadcn` and downloaded upstream documentation
in `docs/frontend/shadcn-upstream`. `sources.json` records document URLs and hashes;
`skills-lock.json` records the skill source. Do not edit vendor skills to encode local policy.

The existing SSR-validated cookie selects Light by default and persists explicit Dark.
It integrates with shadcn tokens and avoids introducing a competing theme provider.
Official examples using system defaults are illustrative; this project never follows OS theme.
Inter/Vazirmatn, next-intl, URL-addressable Modal behavior and security boundaries remain
application requirements. Modal composes shadcn Dialog. DirectionProvider handles Base UI RTL.
Lucide and class-variance-authority are shadcn source dependencies; tw-animate-css supports
its animations. Add only required registry components. No alternate UI kit or styling system.

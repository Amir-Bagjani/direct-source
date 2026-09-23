# Technology Decisions

## Selected foundation

Use Next.js 16, React 19, strict TypeScript, Tailwind CSS v4, CSS custom properties,
`next/font`, native elements, next-intl, Vitest/Testing Library, and Playwright.
Tailwind utilities and shadcn/ui source use the existing semantic token contract.
The native dialog retains its tested history integration.

Theme switching uses no dependency or broad provider. The locale layout validates a minimal
versioned cookie and server-renders the resolved root theme, which prevents FOUC and hydration
mismatch. The root `data-theme` attribute and CSS semantic mappings style the application; the
shared switcher uses the native Button primitive and a narrow client boundary.

Inter and Vazirmatn are loaded through `next/font/google`, downloaded at build time and
self-hosted by Next.js. Vazirmatn is designed for Persian/Arabic interfaces and supplies
the needed variable weights and Arabic subset. The repository currently has no reviewed local
font assets, so `next/font/local` would duplicate the generated assets without adding value.
Keep system fallbacks for load failure and do not add external runtime font requests.

## Evaluated UI technologies

| Technology   | Decision                                                                                                                                                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MUI          | Prohibited by project direction. Do not add or recommend.                                                                                                                                                                                      |
| Tailwind     | Approved v4 styling engine for shadcn/ui. Map utilities to the existing CSS tokens; keep current component styles when they express the product contract.                                                                                      |
| shadcn/ui    | Approved source workflow. Adapt only needed components in their existing owners; never generate a parallel Button or Modal.                                                                                                                    |
| Radix UI     | Not selected now. Its Dialog provides strong focus/keyboard behavior, but replacing the tested native dialog adds a portal/state model that must be reconciled with URL history.                                                               |
| Base UI      | Selected shadcn base, matching the current official default. The Input uses its native-like primitive; Button and Modal preserve their existing native contracts. Add a direction provider when a portaled/composite component first needs it. |
| Storybook    | Deferred. There are only two proven shared primitives and existing component/E2E tests. Add `@storybook/nextjs-vite` when multiple component states need an isolated review workflow.                                                          |
| Icon library | `components.json` selects Lucide for future CLI output, but no icon package is installed until a real component needs one. Directional icons still require RTL review.                                                                         |

Introducing a headless component requires an RTL provider plan for portaled UI,
Server/Client boundary review, bundle impact, and keyboard/screen-reader/browser tests.
A library does not certify the final styling,
contrast, accessible names, or product interaction behavior.

## Agent Skills

Keep the locally installed Vercel `vercel-composition-patterns` and
`vercel-react-best-practices` Skills. `web-design-guidelines` is also installed locally
from `vercel-labs/agent-skills`; it contains no executable scripts and fetches the current
official interface checklist when used.

Verified installation command:

```bash
pnpm dlx skills add vercel-labs/agent-skills --skill web-design-guidelines -a codex -y
```

The project-specific Design System Skill takes precedence for visual values, ownership,
RTL/LTR, localization, and the Modal contract. Vendor Skills provide review, composition,
and performance guidance without replacing project sources of truth.

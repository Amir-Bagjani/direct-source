# UI Workflow

1. Read the official shadcn skill, components.json, project integration and applicable PRD.
2. Inspect installed components. Run `pnpm dlx shadcn@latest docs <component>` and read
   the official docs. Use `search @shadcn` and `add` for missing components.
3. Review generated source and dependencies. Move source into canonical component
   directories and fix imports; never leave competing implementations.
4. Compose existing variants and semantic tokens; Tailwind classes express layout.
5. Preserve both catalogs, RTL/LTR, keyboard behavior, Light default and explicit Dark.
6. Run relevant component tests, `pnpm typecheck`, `pnpm lint`, `pnpm format`, and
   `pnpm format:check`. For visible changes, run the existing Playwright journeys.
7. Document integration changes. Production builds remain phase/CI/release checks.

# Design skill inventory and installation decisions

Reviewed: 2026-10-08. Scope: agent skills and instructions only; no application
source, dependency, UI configuration, or product behavior changes.

## Existing project skills

All existing skills are retained under `apps/frontend/.agents/skills/`:

| Skill | Existing responsibility |
| --- | --- |
| `nextjs-architecture` | Frontend architecture and boundaries |
| `feature-module-design` | Feature ownership and canonical file structure |
| `typescript-architecture` | TypeScript, schemas, and contracts |
| `testing-architecture` | Meaningful test levels, fixtures, and browser journeys |
| `design-system-architecture` | Canonical shadcn integration and design references |
| `ui-kit-architecture` | Official primitives and project adaptations |
| `shadcn` | Official component discovery, documentation, and composition |
| `web-design-guidelines` | Vercel static interface guideline reviews |
| `vercel-react-best-practices` | React implementation guidance |
| `vercel-composition-patterns` | React composition guidance |
| `next-dev-loop` | Next.js runtime/browser verification workflow |
| `ponytail` | Symlink to the existing `.agent/skills/ponytail` installation |

The root and frontend AGENTS.md, `CONTEXT.md`, `components.json`,
`docs/frontend/shadcn.md`, design architecture references (foundations, tokens,
theme, accessibility, Modal), testing/Playwright guidance, and catalog, pricing,
cart, and UI-language requirements informed these decisions. No standalone
case-insensitive `design.md` file was found in project-owned files. The shadcn
integration explicitly retires the previous bespoke visual specifications; do
not create DESIGN.md as a competing source of truth.

## Installed entrypoints

Paths in this table are relative to `apps/frontend/.agents/skills/`.

| Name | Path | Source | Status |
| --- | --- | --- | --- |
| `ecommerce-ux` | `ecommerce-ux/SKILL.md` | Project-authored from the current PRDs and requirement/API contracts | New project skill |
| `frontend-design` | `frontend-design/SKILL.md` | Official [Anthropic skill](https://github.com/anthropics/skills/tree/683bc88e56f3e09ba94f7055977f3d3aa499f202/skills/frontend-design) | Installed unchanged with upstream LICENSE.txt |
| `design-system` | `design-system/SKILL.md` | Project-authored routing entrypoint to existing design skills | Added without duplicating canonical design rules |
| `visual-qa` | `visual-qa/SKILL.md` | Project-authored for existing Playwright, locale, theme, and access contracts | New rendered-review skill |

Anthropic provenance:

- Repository: `anthropics/skills`.
- Commit: `683bc88e56f3e09ba94f7055977f3d3aa499f202`.
- Upstream path: `skills/frontend-design`.
- SKILL.md SHA-256: `d91970639e9f5c37682ac7ab60094d35f1c7c1f38d731bd56396563aee10c1d3`.
- Installed with the Codex skill-installer helper using the explicit commit and
  `--dest apps/frontend/.agents/skills`. This helper does not update the separate
  skills CLI lockfile; this record pins the source without inventing a lock hash.

Both `~/.codex/skills/frontend-design` and `~/.agents/skills/frontend-design`
already exist but differ from this official upstream revision. Neither is
overwritten. The repository-local official copy is the explicit project choice,
not a second project installation. Existing global `design-system`, `design-md`,
and `ui-visual-validator` skills are also retained.

## Alternatives reviewed

External discovery used current upstream pages/skill contents rather than treating
catalog names or popularity as proof of fit. GitHub API rate limits prevented
complete repository metadata retrieval for some alternatives; raw upstream
contents were still available. Only the installed Anthropic source is pinned here;
the alternatives below are evaluation references, not installed dependencies.

| Area | Candidate/source | Decision |
| --- | --- | --- |
| Commerce UX | [ecommerce-builder](https://github.com/bocodes1/claude-skills/blob/master/ecommerce-builder/SKILL.md) | Shopify storefront workflow includes autocomplete, conversion targets, upsells, and a separate visual palette. These assumptions do not fit the approved wholesale MVP. Use project contracts for a dedicated skill. |
| Design system | Existing project `design-system-architecture`, `ui-kit-architecture`, and official [shadcn](https://github.com/shadcn-ui/ui/blob/main/skills/shadcn/SKILL.md) | Suitable canonical implementation already exists. Reuse through a thin `design-system` entrypoint. |
| Design system | [frontend-design-system](https://github.com/chrometaphore/design-system-skill/blob/main/frontend-design-system/SKILL.md) | Discovery/reference workflow overlaps the existing project skills and adds repeated source/write confirmation. No additional installation is needed. |
| Design documentation | Google Labs [design-md](https://github.com/google-labs-code/stitch-skills/blob/main/plugins/stitch-utilities/skills/design-md/SKILL.md) | Requires Stitch project/MCP assets and generates DESIGN.md. This project already has a canonical design integration, so the workflow is not applicable. |
| Design system | Global `design-system` from [ckw-design-skill](https://github.com/connerkward/ckw-design-skill/tree/main/design-system) | Generic token/font rules and sibling dependencies are less appropriate than the project's established shadcn and Persian typography rules. Retain globally; do not import into project routing. |
| Visual QA | OpenAI [playwright-interactive](https://github.com/openai/skills/blob/main/skills/.curated/playwright-interactive/SKILL.md) | Uses a persistent `js_repl` workflow with additional runtime preconditions. The project already has Playwright and test ownership; use those without changing global tooling. |
| Visual QA | [measured-visual-qa](https://github.com/adshine/skills/tree/5fc3e2d1a5817cd741a596a7517a37b37aa223d9/measured-visual-qa) | Useful settled geometry workflow, but explicitly excludes focus/interaction, motion, and source fidelity and routes to sibling skills. It does not cover the requested project's full locale/theme/state audit by itself. |
| Visual QA | Existing global `ui-visual-validator` | Broad tool/CI/baseline suggestions exceed the current project's reviewed baseline policy. Keep it unchanged; use a scoped local skill with existing testing rules. |

The custom skills are original project instructions, not copies of the candidates.
[Baymard's public knowledge hub](https://baymard.com/blog) is linked as optional
commerce research, without treating it as an installed skill or an endorsement.

## Activation and maintenance

The [root activation rules](../../AGENTS.md#design-and-visual-review-skills) and
[frontend instructions](../../apps/frontend/AGENTS.md#design-and-visual-review-skills)
specify when each skill applies. Project PRDs own behavior and access; the existing
shadcn architecture owns appearance; testing architecture owns regression coverage.
Anthropic's general design suggestions operate within that explicit brief.

For future upstream updates, inspect the new revision and license, compare with
the pinned copy, then update this provenance record. Keep the official source
unchanged and put project constraints in AGENTS.md and the routing skill. Avoid
duplicate installs in `.agent`, `.claude`, or a second project skill directory.

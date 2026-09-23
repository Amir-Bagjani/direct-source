# Feature Implementation Workflow

## 1. Establish the slice

- Map the requested behavior to the applicable PRD capabilities and acceptance criteria.
- Read the requirement and OpenAPI contract. If behavior/API changes, update its source
  document and tests in the same change.
- Confirm the feature's domain name using `CONTEXT.md` and respect the implementation
  gates in `docs/technical/frontend/implementation-plan.md`.
- List the route composition and ownership of each planned artifact. Reject speculative
  layers and files before coding.

## 2. Choose rendering and state boundaries

- Default to a Server Component for non-interactive rendering and server-only access.
- Introduce the smallest Client Component for events, browser APIs, client hooks, or
  contexts. Do not turn the route into a client component just to host one interaction.
- Classify state: server state uses RSC/TanStack Query; navigation/modal/filter state that
  must be linkable uses the URL; form drafts use the form layer; local UI state remains
  in the nearest owner.
- Decide whether the initial data is server-only, hydrated for continued client use, or
  interaction-only. Follow the canonical data-fetching guide and start independent reads
  concurrently.

## 3. Place implementation

- Keep `src/app` limited to route mechanics and feature composition.
- Put business components and logic inside `src/features/<domain>`.
- Give each new component a directory and colocate exclusive tests, hooks, utilities,
  types, constants, schemas, styles, fixtures, and private subcomponents.
- Promote a primitive to shared only when a second independent consumer exists.
- Import canonical files directly; never add a re-exporting `index.ts`.
- Add visible copy to both locale files and use logical CSS properties. Follow
  `docs/frontend/design.md` rather than inventing tokens or layout values.

## 4. Complete behavior

Implement applicable loading, empty, error, success, disabled, permission, and mutation
states. Preserve semantic HTML, keyboard interaction, focus management, accessible
names, mobile/desktop layouts, both languages, and RTL/LTR. Keep protected prices and
private data out of public metadata, structured data, logs, and serialized cache.

Do not duplicate server data into React state. Do not use an effect for routine fetching.
Do not add a new state, HTTP, styling, or validation library when the installed stack
already covers the need.

## 5. Test at ownership boundaries

- Place component tests inside the component directory.
- Place a feature-level test beside the feature module it exercises; use Playwright for
  user journeys across route/browser behavior.
- Test behavior and contracts rather than reproducing implementation. Cover both locales
  or direction-sensitive behavior where it can regress.
- Regenerate OpenAPI types and run targeted backend tests if an API contract changes.

## 6. Verify and review

From `apps/frontend`, run the narrow relevant test command, `pnpm typecheck`, `pnpm
lint`, and a targeted Oxfmt check. Use the `next-dev-loop` skill when a running Next.js
development server and browser-level verification are part of the task. Run `next build`
only at checkpoint/CI/release gates or when explicitly requested.

Review:

- The route is thin and the feature owns its business logic.
- Every new component has a dedicated directory and exclusive files are colocated.
- Shared promotion has at least two independent consumers.
- Imports obey the enforced dependency direction and expose no feature internals.
- Server/client and secret boundaries are safe.
- Query/API code follows the canonical data-fetching architecture.
- Product/API/design documentation changed when behavior changed.
- No unrelated migration or speculative abstraction entered the diff.

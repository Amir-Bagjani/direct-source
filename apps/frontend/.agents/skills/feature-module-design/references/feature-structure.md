# Feature Structure

## Define the boundary

A feature represents a business capability from the project's domain and PRDs, not a
screen, technical file type, or arbitrary code grouping. Use vocabulary from
`CONTEXT.md`. Extend an existing feature when the change shares its business rules and
lifecycle; create a sibling feature when it has independent rules and acceptance
criteria.

Routes compose capabilities. A locale page or route group is not automatically a
feature, and one feature may support several routes.

## Grow structure from real code

Start with the fewest files that preserve ownership. Add technical subdirectories only
when the feature has enough code to benefit:

```text
src/features/catalog/
├── components/
│   └── product-card/
│       ├── product-card.tsx
│       └── product-card.test.tsx
├── catalog.api.ts
├── catalog.queries.ts
└── catalog.schema.ts
```

As the feature grows, `api/`, `queries/`, or feature-level `hooks/` may replace flat
files. Do not precreate empty directories or mirror a generic template. Do not add a
feature-level `index.ts`; direct imports are mandatory.

## Ownership decisions

| Artifact                                                        | Correct owner                                              |
| --------------------------------------------------------------- | ---------------------------------------------------------- |
| One component's hook/type/schema/utility/test                   | That component's dedicated directory                       |
| Used by several components in one feature                       | Feature-level named file/directory                         |
| Business-neutral and used by two independent features           | Appropriate `src/shared` module                            |
| Route params, layout, metadata, route loading/error composition | `src/app` route segment                                    |
| Server secret/request policy                                    | `src/server`, guarded by `server-only` when required       |
| Generated backend DTO                                           | `src/shared/api/openapi.ts`; do not hand-edit              |
| Visible copy                                                    | Matching keys in `messages/fa.json` and `messages/en.json` |

Every new component gets its own lowercase kebab-case directory, even when it initially
has one implementation file. Component-exclusive companions stay beside it. Internal
subcomponents remain private and nested only when complexity warrants it.

## API and server state

Use the chain UI → feature query options/hooks → feature API function → shared request
layer. Components do not make raw backend requests.

- Reuse generated OpenAPI types and validate untrusted input/response where the contract
  requires runtime guarantees.
- Browser API functions use the same-origin BFF wrapper. Server adapters stay server-only.
- Centralize predictable keys and reusable `queryOptions` per feature. Reuse them for
  prefetch, client queries, programmatic reads, and targeted invalidation.
- Keep mutation definitions with the feature, disable blind write retries, and invalidate
  only affected detail/list prefixes.
- Keep user/business scope in private cache keys without including tokens. Clear private
  cache when identity changes.

Read `docs/technical/frontend/data-fetching.md` before implementing any of these paths.

## Cross-feature access

A feature must not import another feature's private component, hook, schema, or query
implementation. Prefer app-level composition. If direct collaboration is unavoidable,
define the smallest stable, explicitly named contract file at the owning feature root
and import it directly. Do not create a barrel to simulate a public package.

If two features form a cycle, lift orchestration into `app` or extract a genuinely
business-neutral primitive into shared. Do not use callbacks, context, or a global store
merely to hide a dependency cycle.

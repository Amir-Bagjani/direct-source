# Dependency Rules

## Enforced direction

The local Oxlint architecture plugin currently enforces these forbidden dependencies:

| From       | Must not depend on          |
| ---------- | --------------------------- |
| `shared`   | `app`, `features`, `server` |
| `i18n`     | `app`, `features`, `server` |
| `server`   | `app`, `features`           |
| `features` | `app`                       |

`app` may compose features, shared modules, i18n, and server entry points. Features may
depend on shared infrastructure, i18n helpers where appropriate, and environment-safe
adapters. Shared modules must remain business-neutral. All layers must remain acyclic.

The plugin resolves the existing `@/` alias plus relative/absolute imports. If another
local alias is ever added, update both `tooling/architecture-plugin.mjs` and its
integration test in the same change.

## Feature boundaries

- A feature owns its business rules and implementation. One feature must not reach into
  another feature's `components`, private hooks, internal query definitions, or schemas.
- Prefer route-level composition or a small, explicitly named contract file when one
  feature needs another's capability. Import that file directly.
- Do not create a cross-feature import merely to reuse a few lines. Move code to shared
  only after two independent consumers prove that it is business-neutral.
- Avoid feature-to-feature cycles. If two features need each other, move orchestration up
  to `app` or extract the smallest neutral contract/primitives downward.

## Public interfaces without barrels

This project forbids all re-export barrels, including named and type-only re-exports.
Therefore component and feature directories do not use `index.ts` as a public API.

Expose intent through stable, named files and direct imports, for example:

```ts
import { ProductCard } from "@/features/catalog/components/product-card/product-card";
import type { CatalogSelection } from "@/features/catalog/catalog.contract";
```

Keep internal files unimported outside their owner. A direct filesystem path does not
make an internal module public; ownership and the documented contract decide that.

## Environment boundaries

- Browser modules may use the client-marked same-origin BFF wrapper. They cannot import
  server policies or credentials.
- Server adapters add `server-only`, authorize before reading private data, and create no
  process-wide private cache.
- A neutral query-options module may accept typed server/browser API functions so keys
  and freshness remain shared without importing one environment into the other.
- Never serialize secrets, raw backend errors, or user-private cache entries into RSC
  payloads. Clear private client cache across session identity changes.

## Review checklist

- Does every import point downward or to an intentional contract?
- Is shared code genuinely used by independent consumers?
- Is a feature importing another feature's private file?
- Did a new alias or directory escape the lint rule?
- Did an `index.ts` or other re-export bypass direct-import policy?
- Can server-only code enter a client dependency graph?
- Does the change create a runtime or type-only cycle?

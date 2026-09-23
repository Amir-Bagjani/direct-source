# TypeScript Implementation Workflow

1. Read the applicable architecture, TypeScript, feature, testing, PRD, and API sources.
2. Inspect existing ownership, imports, nearby types, schemas, generated contracts, and
   tests before naming a new declaration.
3. Reuse an existing contract only when its meaning and lifecycle match.
4. Put a new type at the narrowest owner; avoid global directories and barrels.
5. Derive framework, library, generated DTO, schema, and locale types where possible.
6. Separate DTO, domain, form, and view types only for a real representation boundary.
7. Validate untrusted data with the owner's Zod schema and narrow `unknown` values.
8. Keep optionality, nullability, and indexed access explicit; model invalid states out.
9. Export only an intended contract and preserve dependency and server/client direction.
10. Prefer the simplest guard, union, generic, or utility type that enforces the rule.
11. Update runtime tests for changed parsing/behavior and focused type tests for complex
    public compile-time contracts.
12. Run focused checks, then the project checks required by the changed scope.
13. Review the result for unsafe casts, duplicate contracts, cycles, leaked server data,
    and unresolved type errors.

From `apps/frontend`, use existing commands rather than inventing a second toolchain:

```bash
pnpm exec vitest run path/to/affected.test.ts
pnpm test
pnpm typecheck
pnpm lint
pnpm exec oxfmt --check <changed paths>
```

Run `pnpm test:e2e` only when browser behavior or an existing journey changes. Run a
production build only at the repository's checkpoint, CI, or release gates. If OpenAPI
changes, run `pnpm generate:api`, inspect the generated diff, and execute the applicable
backend contract tests too.

For a compiler-option migration, first run `pnpm exec tsc --noEmit --<option>` against the
whole frontend. Record the failures, fix them in bounded batches, enable the option only
after the full project passes, and document any deferred migration rather than weakening
the option with broad exclusions.

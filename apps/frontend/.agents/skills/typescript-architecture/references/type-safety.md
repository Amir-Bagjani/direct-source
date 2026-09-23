# Type Safety

## Compiler policy

`tsconfig.json` uses bundler resolution, isolated modules, React JSX, and these strictness
checks: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noFallthroughCasesInSwitch`, `noImplicitOverride`, and `verbatimModuleSyntax`. Keep them
enabled. The package manifest pins the TypeScript 6 package and the TypeScript native 7
preview used by the current `tsc` binary; `pnpm typecheck` is the authoritative project
check because it runs Next type generation and the deprecation check too.

`allowJs` supports the existing tooling files and `skipLibCheck` avoids checking external
declarations. Neither permits weaker types in application source. Oxlint rejects explicit
`any` outside ignored generated code.

## Unknown and narrowing

Use `unknown` for values whose runtime shape has not been established. Narrow with a
Zod schema, a precise built-in check, or a reusable type guard. An annotation or generic
argument never validates JSON.

Assertions are acceptable only when an invariant was established in a way TypeScript
cannot represent; keep the assertion close and explain the invariant. Do not chain
through `unknown`, use non-null assertions to bypass lifecycle uncertainty, or suppress
errors with TypeScript comments. Fix the contract or add a runtime check.

## Optional and nullable values

With `exactOptionalPropertyTypes`, `value?: X` means a property may be absent; it does not
mean callers may pass `undefined`. Use `value: X | undefined` when presence with an
undefined value is meaningful. Preserve backend `null` only when it is part of the wire
contract, and normalize it at a boundary when the domain uses another representation.

Indexed reads include `undefined`. Check array/map/object access before use, or model a
non-empty tuple when that invariant is real. Do not mark required fields optional to
quiet a failing assignment.

## Useful advanced patterns

- Use discriminated unions for mutually exclusive loading/success/error or domain states.
- Use exhaustive `switch` handling with a `never` assertion when every member must be
  handled and the union is expected to grow.
- Use `as const` for stable literals and query keys; use `satisfies` to validate an object
  without widening its inferred values.
- Use generics when callers preserve a relationship between inputs and outputs. Avoid a
  generic that merely lets the caller assert an unverified result type.
- Derive types with `z.infer`, indexed access, `Awaited`, `ReturnType`, or library helpers
  when that keeps one source of truth. Give complex derived contracts a descriptive name.

Runtime tests prove parsing, transformations, and branches. Add compile-time tests only
for an important public generic, overload, or conditional/mapped type whose inference is
part of the contract; simple interfaces need no type test or new framework.

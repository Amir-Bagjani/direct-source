# Type Organization

## Ownership first

Place a type where its meaning is owned, rather than grouping files by the fact that they
contain TypeScript declarations.

| Scope                             | Location                                                              |
| --------------------------------- | --------------------------------------------------------------------- |
| One component                     | The component directory, such as `shared/ui/modal/modal.types.ts`     |
| Several components in one feature | `features/<domain>/types/`, or inferred beside its schema             |
| API operation                     | Beside the feature API adapter; derive its DTO from generated OpenAPI |
| Route props                       | The route file, using generated Next.js helpers                       |
| Runtime schema and inferred value | Beside the boundary that parses the value                             |
| Two independent features          | The narrow appropriate module under `src/shared`                      |

Do not create `src/types`, `src/shared/types`, or a feature `types/` directory in advance.
Standalone feature-wide contracts belong in `types/` as soon as they exist; inferred schema
types stay in `schemas/`. Follow feature-module-design/references/feature-structure.md.

## Components

Every component already has a dedicated lowercase kebab-case directory. Put a public,
reused, documented, or substantial props contract in `<component>.types.ts`, as Modal
does. A single small private props shape may stay beside the implementation until a
separate file clarifies ownership. Keep closely related component contracts together;
do not create one file per field or helper type.

Derive native props when wrapping an element instead of copying attributes:

```ts
import type { ComponentPropsWithoutRef } from "react";

export interface ActionButtonProps extends ComponentPropsWithoutRef<"button"> {
  intent: "primary" | "secondary";
}
```

Use `ReactNode` for renderable children, the relevant React event type for handlers, and
React 19's ref-as-prop support when a ref is part of the API. Do not add `React.FC` or a
generic merely to annotate a normal function component.

## Public contracts

This repository forbids every re-export barrel, including type-only barrels. Consumers
import an intended type from its canonical file. Keep implementation-only declarations
unexported. A direct path does not make an internal feature type public; cross-feature
access still requires a small stable contract owned under its `contracts/` directory.

Move a type with its owner when responsibility changes. Do not duplicate it temporarily
in a global location, and avoid type-only dependency cycles; lift orchestration to `app`
or extract the smallest proven neutral contract when two modules depend on each other.

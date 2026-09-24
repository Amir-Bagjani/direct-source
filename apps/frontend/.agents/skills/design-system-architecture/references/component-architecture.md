# Component Architecture

Use official shadcn source and composition before custom markup. Place needed primitives
in `src/shared/ui/<component>/<component>.tsx`, with colocated tests and types. Update
CLI-generated imports after moving source. No barrels, duplicate controls or CSS Modules.
Needed shadcn primitives are approved shared infrastructure from the first consumer;
feature-specific assemblies stay in their feature until shared use is demonstrated.

Preserve shadcn component APIs and built-in variants. Button defaults to `type="button"`;
loading is composed with Spinner, `disabled` and `aria-busy`. Keep native props and refs.
Use localized labels, semantic tokens, logical layout and the smallest client boundary.

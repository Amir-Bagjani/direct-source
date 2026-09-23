# Component Architecture

## Ownership rule

Every new reusable or feature component gets its own directory. Every file used only by
that component belongs inside that directory: implementation, test, types, schema,
styles, constants, utilities, hooks, fixtures, mocks, and private subcomponents.

Use the project's lowercase kebab-case directory/file convention:

```text
src/shared/ui/status-banner/
├── status-banner.tsx
├── status-banner.test.tsx
└── status-banner.utils.ts

src/features/catalog/components/product-card/
├── product-card.tsx
├── product-card.test.tsx
└── product-card.types.ts
```

Create only files that the component needs. A small component may consist of one file in
its directory. Complex components may add internal `components/`, `hooks/`, or `utils/`
subdirectories when those groups are real; do not precreate them.

Do not add `index.ts`: project lint prohibits re-export barrels. Consumers import the
canonical component file directly. Private companions remain implementation details.

## Placement decisions

1. If the component exists for one feature, place it under that feature.
2. If two independent features/routes already need a business-neutral component, place
   it under `src/shared/ui/<component>/`.
3. If a hook/type/utility/schema is used by one component, keep it in that component's
   directory even if its technical type sounds generic.
4. If several components inside one feature use it, place it at the narrowest feature
   level with a meaningful name.
5. Promote to shared only after independent cross-feature use is real. Move the tests
   and all exclusively owned companions in the same change.

Do not duplicate a shared implementation across features, but do not generalize two
components that merely look similar while representing different domain behavior.

## Design rules

- Keep a component focused. Separate reusable presentation from business decisions when
  that creates an actual boundary.
- Prefer children and composition for meaningful variants. Do not introduce compound
  component/context machinery for a simple component.
- Avoid boolean-prop matrices. Use explicit variants or composed children when modes
  differ substantially.
- Extract a hook for a coherent reusable/stateful responsibility, not to reduce line
  count. Keep it colocated until another owner needs it.
- Use semantic HTML, accessible names, keyboard behavior, and visible focus states.
- All user-facing strings use next-intl and exist in Persian and English. Components
  must work in RTL and LTR with logical CSS properties.
- Preserve React Compiler compatibility; do not add manual memoization reflexively.

For a genuinely complex reusable API, consult the installed
`vercel-composition-patterns` skill. For measured performance work, consult
`vercel-react-best-practices`. Those vendor skills inform implementation but do not
override this project's ownership, BFF, i18n, no-barrel, or source-of-truth rules.

## Current shared components

The foundation components follow this convention: `shared/ui/{button,modal,
language-switcher,loading,site-header}`, `shared/query/query-provider`, and
`shared/seo/json-ld` each own their component directory. Modal history and its tests live
inside `ui/modal`; callers may import `openModal` directly from
`modal/modal-history.ts` as the opening API. Provider and JSON-LD tests live beside their
components. Query-client and metadata utilities remain at their category level because
they serve more than one owner.

## Review checklist

- Does each new component have a dedicated directory?
- Are its exclusive test, hook, utility, type, constant, schema, style, and fixture
  files colocated?
- Is the component at the narrowest correct owner?
- Were unnecessary files, nested folders, public exports, or abstractions avoided?
- Do external consumers import the canonical file directly?
- Is the client boundary as narrow as the interaction requires?
- Are accessibility, both locales, and both directions covered?

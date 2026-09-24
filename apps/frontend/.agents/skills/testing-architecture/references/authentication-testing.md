# Authentication and Authorization Testing

Authentication is not implemented in the frontend foundation. PRD-01 and ADR-0005 own
the eventual NextAuth/BFF/refresh design. Do not add fake login forms, mock protected
routes, fabricated roles, or credentials merely to satisfy a test category.

When PRD-01 is implemented, cover distinct boundaries:

- Unit/contract: input schemas, error-code mapping, origin checks, BFF allowlists,
  cookie attributes, refresh decision logic, and permission predicates.
- Integration: form validation → BFF request → localized success/error UI; query-cache
  cancellation/clear on logout or identity change; one retry at most after eligible 401;
  no retry for non-idempotent mutation without a reviewed idempotency contract.
- Server/API: unauthenticated and unauthorized operations fail at the BFF/backend
  boundary. UI hiding never proves authorization.
- Playwright: one real login/logout journey, protected-route redirect, persistence where
  required, expiry/recovery, and representative roles. Reuse isolated storage/session
  fixtures for other journeys after the cookie contract is stable.

Exercise concurrent refresh across tabs and replicas at the layer that owns coordination;
a single browser-process mock cannot prove the documented multi-replica invariant.
Never expose or snapshot Django JWTs in browser JavaScript, web storage, HTML/RSC payloads,
test output, traces, screenshots, or committed fixtures. Run destructive auth/session
tests only against an isolated test environment.

`AC-ACC-31` also requires logout → public route → Back/Forward, direct navigation,
reload, prefetched RSC, BFCache restore, another-tab logout, and late query/mutation
results. Assert private content is absent, not only that the URL changed. Use real
session revocation; fake cookies cannot prove this gate. See
`docs/technical/frontend/base-readiness.md` for the acceptance matrix.

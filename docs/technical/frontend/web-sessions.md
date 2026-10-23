# Web session coordination — PRD-01

Decision, 2026-09-25: NextAuth Credentials uses its encrypted JWT cookie only for an
opaque random vault ID. Django remains the identity and authorization authority.
Access/refresh JWTs live in a separate PostgreSQL session vault, encrypted with
AES-256-GCM and a key independent of NEXTAUTH_SECRET. The vault ID is authenticated
associated data; ciphertext cannot be moved to another session. No token enters
browser JSON, RSC props, query keys or web storage.

Every process/replica uses the same PostgreSQL primary and a session-level advisory
lock per vault ID. Pool clients are held until unlock; PgBouncer transaction pooling
is not supported. Before sending a refresh, the `refreshing` marker is committed in
autocommit mode. The lock stays held during the bounded upstream request. Only a
confirmed rotated pair restores `ready`. A crash, timeout or lost DB connection leaves
`refreshing`, which fails closed instead of replaying an old refresh. A database
restored from an old snapshot must not be used for live sessions: truncate the vault
or rotate its encryption key before serving traffic. No stale-replica reads.

Each private read validates Django `/me/`; cookie claims never authorize a user. Reads
may refresh once and repeat a GET once after 401. Mutations are never automatically
replayed. Logout marks the vault closing before attempting upstream revocation; reads
are denied while closing, even if revocation fails. A successful logout revokes Django,
removes the vault row and expires the browser cookie. Failed revocation is reported
as uncertain and can be retried; the UI does not claim server revocation succeeded.

Private pages render no personal information into their RSC shell. Their initial client
state is a loading state; a fresh same-origin session query supplies the data. Pagehide
hides private DOM before a BFCache snapshot; restore/focus validates again. Logout
cancels requests, clears Query cache, broadcasts a token-free invalidation and performs
a hard replace to the locale home. Server route guards and BFF checks remain mandatory.

Runtime configuration: NEXTAUTH_URL, DJANGO_API_URL, NEXTAUTH_SECRET (at least 32 random
characters), SESSION_VAULT_KEY (32 random bytes, hex), FRONTEND_DATABASE_URL. Apply
`apps/frontend/tooling/session-schema.sql` to a dedicated frontend database with a
restricted runtime role. Use HTTPS outside localhost and encrypted DB transport in
deployment. Schedule deletion of expired vault rows; their expiry always denies access.

References: [NextAuth Credentials](https://next-auth.js.org/configuration/providers/credentials),
[PostgreSQL advisory locks](https://www.postgresql.org/docs/16/explicit-locking.html#ADVISORY-LOCKS),
[node-postgres clients](https://node-postgres.com/features/transactions). This extends
ADR-0005; it does not introduce another identity issuer or weaken Django refresh reuse.

## Operations and tested scope

Run `pnpm session:migrate` with the frontend's private environment before serving login.
The migration is idempotent and creates only `web_auth_session` plus its expiry index.
The runtime role needs SELECT/INSERT/UPDATE/DELETE, not database creation. Use a dedicated
database; local development can share the existing PostgreSQL instance on port 55432.
All replicas must share the same key and primary. Do not put this table behind a
transaction-pooling proxy, read replica or asynchronous failover that can replay an old
refresh pair. Scheduled maintenance may delete rows with `expires_at <= now()`.
Rotating the vault key invalidates existing sessions; deleting rows does not itself
revoke Django sessions. Unknown refresh outcomes stay unusable until expiry; the user
can sign in again, and the UI never claims their old Django session was revoked.

The initial account slice displayed only the authenticated User DTO. PRD-01 now also
implements business onboarding, scoped operator review, revisions and restricted continuity;
these use their own live Django authorization, not the login DTO. Price access remains
independent of controlled access and purchase permission.

`test:e2e:accounts` starts real Django in a disposable PostgreSQL database and two
independent Next.js processes sharing the encrypted vault. It covers both locales, real
Credentials cookies, CSRF rejection, logout/direct/reload/Back/Forward, client navigation,
other-tab logout, delayed responses, A-to-B identity changes, backend expiry/suspension,
concurrent refresh across processes and a persisted uncertain-refresh state. The refresh
test changes only the local access-token expiry hint to force rotation; Django receives
and rotates its actual signed refresh token. Unit tests prove the marker precedes HTTP
and is never reset after an unknown result. Trace/video/screenshots remain disabled.

Chrome and Playwright WebKit in this environment exclude the account document from native
BFCache because it and its authenticated fetches use `Cache-Control: no-store`. The tests
assert a fresh safe history navigation, and separately dispatch persisted pagehide/pageshow
against the real signed-in UI to verify synchronous hiding and fresh authorization.
**This is not evidence of a native persisted BFCache restore**. Keep native Safari/Firefox
restore checks in the release matrix when those browsers admit this document; do not
remove production no-store headers merely to make a BFCache test pass. The behavior is
consistent with [Chrome's documented no-store restrictions](https://developer.chrome.com/docs/web-platform/bfcache-ccns).

All browser cache decisions are secondary to server authorization. A valid encrypted
cookie replayed after logout still receives 401. Other documents receive a random,
identity-free invalidation message; a sender ignores its own BroadcastChannel message,
so logout cannot navigate away before the server confirms revocation. Failed logout
leaves private data cleared and offers an explicit retry.


## Email/account recovery integration — 2026-09-26

Account writes use the existing vault lock and refresh before sending when necessary; a
mutation is never replayed after an upstream error. Password reset is public and Django
revokes every prior auth session. After confirmed success the BFF expires the current web
cookie; the client cancels/clears private queries and sends the existing identity-free
session-change event. Other protected tabs hide/leave, and old cookies fail the next live
Django check. Email verification itself grants no business permissions.

Email forms remain mounted during ordinary session polling so an in-progress password or
email draft is not erased. The containing private region stays hidden and inert until authorization finishes.
Logout, 401, cross-document invalidation and identity change discard private content;
pagehide clears the query cache while retaining the masked same-identity form host.
See the email-link fragment contract in `../api/auth-and-trust.md`.


## Guided Account lifecycle — 2026-10-09

The protected boundary is the sole account session lifecycle owner. Its stable session
key retains the 15-second live check; refetch hides/inerts the existing tree instead of
replacing it with a loading component. Network errors show an explicit Retry against
that query. Pending/fetching are not treated as invalid identities.

Pagehide synchronously conceals and inerts the private region, cancels requests and
clears the entire query cache. The boundary retains a component-local identity snapshot,
and AccountScreen retains validated view data for its business/sections/role form hosts.
This is an intentional form-draft exception to the no-query-data-copy rule: snapshots
never enable requests or authorize UI and are never persisted or reinserted into Query
cache. A live successful query gates interaction; failed section/business/role checks
mask their existing hosts with real retry. Logout/401/identity changes unmount the host,
remove the snapshots, cancel requests and clear the cache. The global header's local
closing event also conceals protected content before its actual logout mutation.

Keeping masked document height prevents scroll clamping; focus is restored with
`preventScroll` only when it fell back to body. No `scrollTo`, polling suppression or
private browser storage is used. Wizard steps stay mounted and use native history
integration for the `step` query; reload reads the last complete server section, not an
imaginary incremental autosave. Unsaved data stays in memory for the current identity.

Private overlays use the existing Base UI portal container inside the same retained
DOM boundary. Dialog, Sheet, DropdownMenu and Tooltip inherit that container through
shared `PortalContainer`, including nested query regions. Inert descendants are hidden
without a transition: an inherited visibility change must not remain visible for a
control's animation duration. Modal unit tests cover a retained open draft and direct
URL mounting; the catalogue preview browser flow checks synchronous pagehide concealment,
same-node recovery, Escape and trigger focus. These synthetic events do not certify
native persisted BFCache behavior.

The server Header slot exposes only opaque session-cookie presence. Personal/role data
is fetched on opening its menu and permissions come from the existing live BFF. The
account navigation validates operator access before exposing operational links; Queue
is never fetched by a denied account screen. Non-suspended manufacturers may use the
private Catalog Workspace before verification, as specified by catalog-drafts.md.

The new browser regression exercises natural 15-second polling with a real Account
form and checks draft, focus and document scroll/height, a session 503/retry, explicit
persisted lifecycle events, Wizard Back/Forward and unauthorized Queue suppression.
Synthetic persisted events retain the native-BFCache limitation documented above.

Private account GET observers also require the boundary's live `authorized` flag;
keeping a masked form mounted must not restart a request after cache clearing. Operator
subtrees receive authorization gated by the live successful role query. Their own
business, section, revision, support and safety queries retain only same-key view data
behind the private region. Unassigned safety cases expose Claim without a premature
history query; reassignment removes the previous operator's history. Mutation fieldsets
remain disabled through awaited invalidation so a late success callback cannot clear
the user's next command draft. These paths have component regression coverage.

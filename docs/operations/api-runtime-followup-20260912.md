# API runtime follow-up (2026-09-12)

## Scope

This change follows the CPU-budget patch in #1335. It does not establish which project
consumed the team's Vercel quota, change a plan, or unpause the Vercel account.

### Bounded search

`GET /api/search` now returns one page: `page=1`, `pageSize=24` by default, with a hard
80-item response cap. `pagination` contains `page`, `pageSize`, `total`, `hasMore` and
`nextPage`. Local catalogue type counts and coverage describe all filtered results, not
only the page. KMAS type counts are explicitly marked `typeCountScope: "page"`, because
that provider does not provide full-result facets. Its own maximum page is 10,000.

The HTTP service, browser static engine, Explorer's More button, and command palette
use the same pagination contract. Saved IDs are filtered before page selection without
losing adaptation relationships from the complete catalogue. A present empty `ids`
means no saved works, never an unrestricted search. Saved collections use read-only
`POST /api/search` with a JSON object of string query fields and the normal CSRF header;
IDs do not become long URLs. Inputs are bounded to 1,000 IDs, 128 characters per ID.
Invalid/repeated page parameters, invalid bodies and excessive sizes return 400.

The Explorer prevents overlapping More requests, rejects non-advancing responses, ignores
late results from a replaced query, and preserves already loaded cards when a later page
fails. Legacy unpaged responses remain displayable, but the new saved-search POST endpoint
requires the new server; deploy client and server together.

Server search computations (including aggregate counts) are reused for 30 seconds per
catalogue revision/array. The LRU holds at most 16 queries and 100,000 title references,
not private user data. Request-time KMAS enrichment bypasses this cache. The existing
client cache adds up to 30 seconds. Offset pagination promises no gaps/duplicates for a
fixed snapshot, not transactional consistency across live catalogue replacements; refresh
restarts at page one. This is not a persistent search index or database cursor migration.

### OG without self-HTTP

The postbuild step reads the already-public `dist/data/catalog.json` and emits at most
256 hash-sharded files under `dist/og/titles`. Only the fields needed for OG/Book metadata
are copied. Both ID and slug lookup are supported. The function caches at most 16 shards;
malformed IDs cannot become file paths. Title bots no longer load Nest, a full gzip catalogue,
reviews, or the same site's HTTP API. Title OG metadata now follows the deployment snapshot,
not request-time enrichment. Existing successful-title CDN caching is unchanged.

Marketplace OG loads only the marketplace DI context and invokes the existing anonymous
`CreatorMarketplaceService.getById` policy for every request. There is no release data cache
or owner identity. Hidden/deleted/unavailable resources keep a no-store fallback. Rendering,
canonical-host selection, HTML/JSON-LD escaping, and human SPA behavior remain intact.

### Isolated Nest application graphs

The Vercel API adapter chooses an application graph before importing product modules:

- `/api/auth/*`: AuthApiModule.
- `/api/creator/*`, `/api/creator-resources/*`, `/api/studio-ai/*`,
  `/api/studio-music/*`, `/api/studio-realtime/*`: StudioApiModule.
- Remaining API paths: GeneralApiModule (catalogue/community/me/admin/etc.).
- Existing no-argument callers, or `API_SERVERLESS_MODULES=0`: the original full AppModule.

Applications share a single bootstrap implementation for security headers, CORS, rewrite
normalization, runtime role, session verification, CSRF, body limits, prefix exceptions,
validation, sanitized logging and exception policy. A failed application promise is removed
so the next request can retry. General API retains the marketplace namespace guard on /me
and /reviews without booting all marketplace controllers. Native main and studio-live
transports retain their original combined module graph/lifecycle.

This is logical lazy initialization inside the existing Vercel function, not new services,
projects or databases. A warm instance may hold several application graphs. Cold-init CPU,
warm memory and total usage must be measured after rollout; no percentage saving is asserted.

## Verification

Focused tests cover server/static pagination parity, saved-ID filtering, cache invalidation,
query-switch races, retry, CSRF transport, OG escaping/visibility, boot selection and retry.
The existing CI guard is changed from an exact test count to an explicit required-file set;
removing any old/new required member still fails, while adding another test is allowed.
No required job, existing suite, performance threshold or branch protection is relaxed.

`pnpm run verify:api-serverless-build` runs after API AND web builds. It packages actual
Vercel function artifacts and probes fresh auth/Studio/general processes, login-CSRF,
local title OG files, anonymous marketplace policy reachability, and native fail-closed
behavior outside the source tree. Probes use an unavailable loopback test DB and forbid
external HTTP, never production credentials. A passing build alone is not a live-user or
collaboration acceptance test.

Record exact-head CI results in the PR; pending or failed checks are not verification.

## Rollout and rollback

Deploy API and browser from the same checked commit. Confirm bounded search + More + saved
filter, bot metadata, anonymous/authenticated sessions, logout/revocation, work load/save and
native realtime separately. Compare per-function CPU, invocation counts, cold starts, warm
memory and error rates before/after; the account-level usage pause is a separate control.

`API_SERVERLESS_MODULES=0` selects the previous full application graph for diagnostics; this
change does not set that environment variable. Reverting the entire commit restores the
previous search client/server/OG contract together. Do not revert only one side of pagination.

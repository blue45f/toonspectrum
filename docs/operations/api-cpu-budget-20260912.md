# API CPU budget patch — 2026-09-12

## Scope

Original patch base: `2aa8132fd82a8bfdd8efaad671fb6eec6ae6fdc6`.
Integration base: `da360972bf73405e424a53dc599b1f07be35382d`.
The earlier offline patch was not uploaded. This integration preserves the later
main CI gates and adds the five CPU regression suites to the required static job.
PR checks, merge and production deployment must be verified separately.

This patch reduces redundant work; it does not establish which project/function
consumed the team's historical Vercel CPU allowance. It does not change billing,
secrets, database schema, dependencies, deployment configuration or DNS.

## Changes

### Explicit serverless catalog initialization barrier

The serverless adapter opts into deferred initialization before app.init().
The CatalogService injection token resolves to a lifecycle wrapper. Ordinary and
native servers retain eager initialization, even with VERCEL=1. GET/HEAD requests
for /api/config, /api/cover and the three health paths, plus OPTIONS requests, do
not require catalog loading. All other paths conservatively await the same
initialization promise, including fortune, reviews and unknown future routes.
Authentication, CSRF and body-parser boundaries stay in place. The original
catalog load, refresh timer and shutdown implementation remain. This is not a
complete split of the NestJS module graph or all Studio/auth APIs.

### Public catalog HTTP caching

Successful anonymous GET/HEAD responses for home, calendar, insights, ranking,
explore, tags and the author directory can use a 30-second CDN TTL. Authenticated,
cookie-bearing, ranged, failed, Set-Cookie and empty-catalog responses do not
populate this cache. Vary preserves Origin and adds Cookie, Authorization and
X-User-Id. Config, search, title details, reviews, marketplace visibility, random
and writes are excluded. Request-time KMAS enrichment disables the shared HTTP
cache. No stale-while-revalidate allowance is added. Verify actual CDN behavior
after deployment; local header generation does not prove edge-cache acceptance.

### Home fragment cache

Reuse catalog-only filtering and sorting for at most 30 seconds, invalidating on
catalog revision, array identity, Korean weekday, expiry or clock rollback.
Review counts stay outside this in-process cache and are loaded for every origin
invocation. Collection containers are copied; Title objects preserve the existing
shared-object contract. CDN caching can add another 30 seconds: home metadata
can be up to 60 seconds older than the in-process source with defaults, in
addition to any upstream source lag. Review counts can be edge-cached for 30s.

### Search normalization reuse

A WeakMap caches normalized title, author, alternate titles, tags, genres and
synopsis per live Title object. Comparing raw fields and array snapshots detects
in-place KMAS edits. Old catalogs can be garbage-collected. This trades memory
for repeated-search CPU. Ranking, ties, filters, response shape and autocomplete
are preserved. Pagination and OG internal HTTP removal are NOT implemented:
these need coordinated frontend and metadata/visibility contract changes.

## Controls and rollback

- CATALOG_EAGER_INIT=1 restores serverless eager initialization.
- WEBDEX_CATALOG_FORCE_DB=1 retains the eager legacy DB behavior.
- CATALOG_PUBLIC_CACHE_SECONDS=0 disables the new public HTTP cache.
- CATALOG_PUBLIC_CACHE_SECONDS accepts integer 0..300, default 30; invalid disables.
- Existing KMAS_MERGE_ON_ACCESS is respected, not changed.
- Revert the patch commit to remove home/search caches; no DB migration is needed.

Vercel flag changes require redeployment. This code cannot remove already-accounted
CPU usage or unpause the account.

## Verification boundary

Five focused Vitest files cover initialization, concurrent requests, lifecycle,
cache exclusions, home invalidation, text mutation and scoring parity. They are
added to CI's required static job without removing any existing checks. The
required core still depends on static, serial performance and release build.

Earlier offline evidence: 13 TypeScript syntax checks and 588 dependency-isolated
assertions on Node 22.16.0. Small framework mocks are not real NestJS integration.
The repository requires Node >=24.16.0 and pnpm 11.4.0; CI must test the exact PR
head using the locked workspace before merge. Do not bypass branch protection.

The previous synthetic 12,000-title warmed-search sample (six queries) measured
1435.296ms CPU before and 86.439ms after. This is neither production telemetry nor
a cold-start benchmark and does not establish a 94% reduction in Vercel usage.
Before claiming incident mitigation, compare project/function Active CPU,
invocations, cache hits and cold starts under comparable traffic.

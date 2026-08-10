# Named palette, Brand Kit, and saved clip persistence capability survey

Date: 2026-08-09
Scope: P0 creative-authority trio only
Authority: `LEGACY_DATA_MIGRATION=FALSE`, shared `/studio-local-v12.db`

| Candidate | Unique Strength | Missing Features | Visual Quality | p50/p95/p99 | Peak Memory | Worker/Bundle Cost | Determinism | License | Interop Cost | Maintenance Risk | Final Role |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Existing `@sqlite.org/sqlite-wasm` 3.53.0-build1 + shared OPFS SAH-pool | One V12 local authority, queued SQL KV writes, existing lazy database runtime, atomic whole-value upsert | This slice has not yet measured the three namespaces in a production browser Worker, real quota exhaustion, tab conflict, or browser-process crash | Exact creative meaning: palette order/colors, Brand Kit references/fonts/logo bytes, and arbitrary bounded clip element JSON are canonicalized without approximation or truncation | Node real-wasm correctness measured; browser OPFS p50/p95/p99 **unmeasured** | Node/browser peak WASM/Worker memory **unmeasured** | Reuses existing sqlite-wasm/Worker assets; no new dependency or second database | Strict canonical compact JSON; exact keys; duplicate/unknown/lossy values fail the whole read | Apache-2.0 wrapper; SQLite public domain | Low: existing `acquireStudioLocalDatabase()` and `kvGet/kvSet` | OPFS availability, quota, and shared runtime lifecycle | **Selected product authority** under three separate V12 namespaces |
| IndexedDB feature stores | Native async browser persistence and structured values | Not the selected shared SQL authority; would require new schema/versioning and transaction adapters | Could preserve JSON, but no implementation or corpus evidence exists for this trio | Unmeasured | Unmeasured | Browser platform; additional application adapter | Depends on a new codec boundary | Web platform | Medium: duplicates shared persistence architecture | Dual-authority and upgrade drift | Rejected for product; no automatic fallback |
| Historical localStorage keys | Existing synchronous import/test seams and old user payloads | Main-thread blocking, whole-value quota, weak concurrency/crash semantics, forbidden migration | Legacy parsers are permissive and may filter malformed entries; they are not V12 canonical authority | Ineligible | Browser quota-bound, unmeasured | No bundle | Historical string only | Web platform | High semantic migration risk | Data resurrection and hidden fallback | Explicit test/import seam only; product boot never reads it |
| Current-tab memory | Keeps an accepted mutation usable after a surfaced durable failure | No refresh, tab, or process durability | Exact already-validated in-session value | Not a durability candidate | Runtime heap unmeasured | None | Runtime-local | Internal | Low | Lost on refresh/unmount | Explicit degraded UX only; never reported as saved |

## Selected boundaries

The three product repositories share the existing database handle but never share a KV
namespace:

- named palettes: `studio-named-palettes-v12` / `library-v1`;
- Brand Kits: `studio-brand-kits-v12` / `library-v1`;
- saved clips: `studio-saved-clips-v12` / `library-v1`.

Each value is a versioned envelope with an exact schema name, exact record keys, unique
IDs, canonical compact JSON, and feature-specific bounds. A single malformed item rejects
the entire value. No parser filters bad rows, drops unknown fields, slices item lists, or
normalizes a lossy number and then calls the result successful.

## Measured evidence in this slice

Focused tests initialize the real sqlite-wasm engine with the memory VFS, execute SQL
through `StudioLocalDatabase.kvGet/kvSet`, and prove round-trip bytes, ordering of
overlapping mutations, all-or-nothing rejection, unchanged prior data on item overflow,
and explicit unavailable errors. Panel tests additionally prove visible current-tab
memory degradation and stale hydration fencing.

That evidence is semantic and executable, but it is not a browser OPFS benchmark. This
document therefore makes no p50/p95/p99, peak Worker/WASM memory, close/reopen, forced
termination, quota exhaustion, or multi-tab claim for these three namespaces.

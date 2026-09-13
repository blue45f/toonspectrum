# Offline drawing resilience — 2026-09-13

## Delivered behavior

- Network-first navigation has a 4-second deadline (including navigation preload).
  Network failure, 408 and 5xx can use a verified HTML shell. 401/403/404/429 remain
  real server responses. Studio fallbacks must retain COOP/COEP isolation.
- Only query-free canonical successful HTML refreshes the shell. An error page,
  redirect or a late response after the deadline cannot replace the good shell.
- Critical code is read from the install precache as well as the runtime cache;
  Cache API denial no longer blocks an otherwise successful online asset request.
- A failed dictionary warm-up can retry on a later Studio navigation.
- The editor has a lazy, collapsible Korean offline-preparation panel. Preparation
  happens only on a click; it covers the app shells, critical code, Studio dictionaries
  and the same-origin build resources currently recorded by the page's resource timing.
- The optional panel has its own error boundary and a non-reloading lazy loader.
  A failed panel chunk cannot unmount or reload the drawing document.
- Preparation is limited to 400 requested URLs, 32 MiB downloaded, 8 MiB per resource
  and a 30-second network preparation window. Fetches are sequential. Private API URLs,
  external hosts, credentialed/query URLs and non-build media are not admitted.
- Every item is re-read after writes, so quota failures and cache trimming cannot
  silently report a complete resource set. This is a point-in-time check only.
- Persistent storage is requested only by another explicit user action. Denial and
  near-full storage have visible backup guidance. Resource readiness is NEVER labeled
  as manuscript-save success.

## Data safety and retained boundaries

PR #1363 already separated verified local project documents from remote-work loading.
This change preserves that route resolution, recovery keys, auth/document boundaries,
OPFS/SQLite writer ownership, collaboration locks and the server save protocol. It
neither wipes browser documents nor uses a Service Worker to open the SQLite database.
No forced update, forced reload or automatic publication is introduced.

This is NOT a new durable cross-session server-save queue. The existing tab-scoped save
intent remains unchanged; closing a tab is not a promise of later background upload.
It does not automatically unlock remote manuscripts whose source cannot be verified,
nor download every brush, external image, font, 3D model, or unvisited lazy tool. The
panel explicitly states these limits. First-ever visits without network remain unsupported.

## Verification

`node --test scripts/studio-offline-resilience.test.mjs` executes the production helper
modules after TypeScript transpilation, using Node fetch/Response/streams. It is not a
browser or production E2E. Worker wiring tests and eight React panel/fault-isolation
tests run through Vitest. Both commands are in the protected core workflow's static
job: failing offline tests prevent a successful core. All pre-existing core commands,
build/lint/type checks and performance gates are preserved; no duplicate runner is added.

A real-device acceptance pass must additionally draw strokes, use eraser/layers/undo,
wait for the existing local-save acknowledgement, disconnect the network, reload and
restart the browser, then verify restored pixels and source identity. That pass has not
been claimed from helper or UI tests.

## Real drawing verification follow-up

The initial resource-timing-only preparation missed modules after the browser's timing buffer filled. Chromium could draw, but an offline reload failed on missing editor chunks; recovery subsequently exposed a missing release-schedule normalizer. These failures were reproduced before the fixes, not waived.

- Build a bounded explicit-click static closure for the editor/router, inspector/hints, autosave/history, SQLite worker/WASM, and document recovery metadata. This is not an install or automatic warm-up payload.
- Pin only this build-bounded core pack into the versioned precache. Remove duplicate runtime copies only after verifying the protected copy. Keep optional assets under the runtime cache bounds.
- Supplement timing entries with actual module-preload/stylesheet/script URLs. The request limit is now 1,024 URLs; download/time/per-file limits still apply. This does not enable arbitrary origin, API, or query-string caching.
- Include the drawing pack in the worker build fingerprint; reject a renamed/missing core module, missing storage worker/WASM, or a core pack over 32 MiB at build time.
- Report a cached navigation separately from the browser's internet indicator. The label is navigation provenance, not a live API-health claim.

Executed Chromium production-preview evidence:

1. Real pen, Undo/Redo, and OPFS/SQLite autosave with the network disabled.
2. Export code warmed once online, then network disabled again for reload, explicit recovery, and PNG export.
3. Restored PNG retains 6,012 non-background pixels and the original dimensions (1440 x 2160). No unexpected browser errors remained. Four exact optional external-font/bootstrap URL failures are recorded separately, not hidden as editor successes.
4. Real origin 500, 503, and a stalled response recover the isolated cached shell. 403/404 remain visible, and updates still require explicit activation.

Run the offline lifecycle with `TOONSPECTRUM_VERIFY_OFFLINE_DRAWING=1 pnpm exec tsx scripts/verify-studio-lifecycle.mts`. Use the normal lifecycle command for the online baseline. Failure screenshots/body/error logs are retained.

Scope remains limited: this verifies Chromium and one default opaque pen, not all browsers/brushes, full browser restart, authenticated cloud replay, or a server-manuscript offline-copy workflow. Server-save intent still uses its existing tab-scoped storage; no unverified SQLite migration or automatic cloud overwrite is introduced. The existing source/permission protections remain intact.

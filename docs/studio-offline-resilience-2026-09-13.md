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
browser or production E2E. Worker wiring tests and React panel tests run through Vitest
in the dedicated regression workflow. Existing required core checks remain untouched.

A real-device acceptance pass must additionally draw strokes, use eraser/layers/undo,
wait for the existing local-save acknowledgement, disconnect the network, reload and
restart the browser, then verify restored pixels and source identity. That pass has not
been claimed from helper or UI tests.

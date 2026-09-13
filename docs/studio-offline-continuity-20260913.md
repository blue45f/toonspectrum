# Offline drawing continuity and persistent save intent

## User behavior

1. Open Studio online and use **오프라인 리소스 준비**. Preparation is explicit and bounded; ordinary readers do not download the drawing pack.
2. A prepared current-build editor is preferred over the independent rescue drawing page during an outage. Missing/evicted/invalid resources still fall back safely to rescue.
3. Pen, undo/redo, OPFS/SQLite autosave, first-use PNG/project export and recovery resources are included in the core pack. This is not a claim that every optional font, brush or 3D model is downloaded.
4. The save center records a content-free intent under the existing local document/account scope. It does not require a live auth endpoint to remember a local task; it does not grant server authentication or unlock a server document.
5. After closing the browser, the intent is a **manual-review reminder**, not permission to upload whichever document is visible. Same-tab explicit reconnect saves remain separate. Original source/permission/revision/CRDT barriers remain intact.

## Data and failure boundaries

- Existing shared DedicatedWorker SQLite/OPFS authority only, namespace `studio-save-intent-v12`; no new service, database migration, network writer or background-sync worker.
- The record holds schema, opaque receipt id, owner/document scope, timestamp and observed revision, never artwork, credentials or a duplicate project payload.
- Writes and clears are serialized per scope and verify the persisted row. A stale acknowledgement/cancellation cannot clear a newer receipt.
- Only the actual validated pipeline success acknowledges an intent. A fulfilled Promise after login/metadata validation, an API error, or a revision refresh is not success.
- Corrupt rows fail closed. Storage rejection/timeouts are visible and do not assert durability. Ancillary receipt IO is bounded; a failed cleanup does not mislabel a successful cloud save as failed.
- Cancel only removes metadata. Browser site-data deletion or eviction can still remove local files; export project backups.
- SQLite receipt parsing/persistence is loaded outside the initial synchronous drawing module closure and explicitly included in the offline pack.

## Verification commands

```sh
pnpm exec vitest run apps/web/src/app/service-worker apps/web/src/domains/creator/offline
node --test scripts/studio-offline-resilience.test.mjs
pnpm run build
pnpm run check:studio-bundle
TOONSPECTRUM_VERIFY_OFFLINE_DRAWING=1 pnpm exec tsx scripts/verify-studio-lifecycle.mts
pnpm exec tsx scripts/verify-studio-service-worker.mts
```

The offline lifecycle verifier uses a temporary persistent Chromium profile, real pointer strokes,
continuous offline execution, first-use export, a full Chromium-process close/reopen, actual
OPFS/SQLite recovery, PNG pixel comparison, and intent restoration with no inherited session outbox.
It must not be described as passing until its executable report says so. Authenticated cloud saves
are covered by the save pipeline tests, not claimed as a real production-account upload here.

## Integration provenance

The inspected drawing-continuity changes from the existing `fix/offline-drawing-continuity-20260913`
worktree (base b160b71a7) were copied into an isolated worktree; the source worktree was not modified.
Captured patch SHA-256: `0f9e936b2c895c0352c78ecb3ddd8440bef0868f750aa09639ddbadaf6d5bb9e`.
This integration also adds missing first-use watermark/receipt resources and persistent save intent.
No CI thresholds, branch protection rules, dependency versions, or paid-service configuration changed.

## Restart-owner correction and executed browser evidence

An auto-published `?room=` survived Chromium shutdown while its tab-only origin record did not.
The next launch incorrectly became a joiner and hid the SQLite recovery candidate behind the
remote-convergence lock. A bounded local-origin navigation record is now scoped to account and
local project/document/draft identity. It holds no artwork, token or server role. Reclaim requires
an exact known origin and a non-stealing Web Lock with no active owner; saved works, remixes,
unknown rooms, denied storage and unsupported locks are never promoted. Active companion tabs
remain joiners. Server auth, ACL, source hydration and CRDT server acknowledgement remain unchanged.

Actual Chromium production-preview verification after this correction: **PASS**. Network stayed
disabled for pen/Undo/Redo/SQLite autosave, first-use PNG export, process close/reopen, local-origin
reclaim, explicit manuscript recovery and pixel-identical PNG export. The save-intent reminder
also survived with no inherited sessionStorage outbox. JavaScript page errors and unexpected
failed responses: zero. This is one opaque-pen Chromium lifecycle, not all tools, all browsers,
real devices, or an authenticated production-server save.

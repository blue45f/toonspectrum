# Production Bible SQLite hybrid design

## Authority boundary

```text
StudioProductionBibleWorkspace
  -> createStudioProductionBibleSqlitePersistence()
  -> acquireStudioLocalDatabase()
  -> openStudioLocalDatabase({ vfs: "opfs" })
  -> toonspectrum-studio-sqlite/.opaque/*
  -> /studio-local-v12.db
  -> kv(namespace="studio-production-bible-v12", key=v12 owner/work scope)
```

The Production Bible is metadata, not an engine-owned rendering object. The canonical
document remains in stable ToonStudio model types and is stored as one bounded JSON
value. No IndexedDB object, SQLite statement, OPFS handle, or Worker object enters the
project model.

## Write and recovery semantics

1. Normalize the accepted document through the bounded Production Bible model.
2. Serialize the normalized model into deterministic compact JSON.
3. Queue writes per owner/work key so invocation order is preserved.
4. Execute one SQLite `kvSet` upsert. Readers see the previous complete value or the new
   complete value, never a torn JSON fragment.
5. Fence Workspace load/save completion by generation. Late work cannot replace a newer
   user edit or a new document scope.
6. On SQLite write failure, retain the accepted edit only in session memory and display
   `메모리 임시`; do not claim persistence or switch to another store.
7. On unavailable/corrupt authority without a prior accepted session value, display
   `SQLite/OPFS 사용 불가`; do not normalize corruption into an empty success.

## Strict read boundary

A SQLite value is accepted only when all of these hold:

- UTF-8 size is at most 2 MiB.
- JSON parsing succeeds.
- `StudioProductionBibleSchema` strict validation succeeds.
- Entry, list, ID, name and description bounds remain valid.
- Re-serialization produces byte-identical canonical compact JSON.

Corrupt and pretty-but-noncanonical probe rows both returned `backend="unavailable"`
with an empty unapplied document. The valid main owner/work document remained intact.

## Worker lifecycle

The browser evidence has two distinct recovery paths:

- Normal: close the shared database runtime, install/open the same V12 SAH-pool again,
  and read exact canonical bytes.
- Forced: save through the option-free product persistence, post a receipt, terminate
  the Dedicated Worker without calling close, wait 250ms, start a separate Worker, and
  reopen/read the same bytes.

Forced recovery passed with a 9.215ms database reopen and a 319.830ms total
terminate/wait/new-Worker recovery envelope. The fixed 250ms wait is recorded and is not
misreported as SQLite latency.

## Legacy and fallback policy

- Product key: `toonspectrum-studio-production-bible:v12:<owner>:<document>`.
- Legacy key: `toonspectrum-studio-production-bible:v1:<owner>:<document>`.
- Product code never calls `load(legacyKey)`.
- Legacy IndexedDB/localStorage adapters require both explicit injection and
  `legacyDataPolicy="import-explicit"`.
- Memory is a visible degraded session state, not a second authority.
- Cloud/server sync is not implied.

## Fault handling

| Fault | Injection | Required result |
|---|---|---|
| SAH-pool installer throws | Real browser Worker + real `openStudioLocalDatabase`, wrapped SQLite API installer throws | load `unavailable`; save `memory`; surfaced error; no fallback |
| Quota error at DB acquisition | Real browser Worker + injected `DOMException("QuotaExceededError")` | load `unavailable`; save `memory`; no fallback |
| Actual browser quota exhaustion | No portable deterministic Chromium quota-lowering API | Quarantined; never inferred from synthetic injection |
| Worker killed after committed save | `worker.terminate()` before any close | New Worker reopens exact canonical bytes |

Multi-tab simultaneous semantic editing remains outside this persistence slice. SQLite
serializes storage operations, but ToonStudio still needs an explicit document conflict
policy before multi-tab collaborative editing can be called complete.

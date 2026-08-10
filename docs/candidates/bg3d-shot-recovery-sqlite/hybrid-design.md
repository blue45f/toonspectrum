# BG3D shot-batch recovery SQLite/OPFS hybrid design

## Authority and data flow

```text
StudioBackground3D default factory
  -> shared acquireStudioLocalDatabase() handle
  -> Web Locks exclusive fence
  -> kv[studio-bg3d-shot-batch-recovery-v12, catalog-v1]
       job + queue + checkpoint + lease/fence + revision + usage ledger
       deterministic artifact references only
  -> OPFS asset CAS
       sha256:<64hex> -> original PNG/PSD bytes
```

The UI already calls `createStudioBg3dShotBatchRecoveryStore()` without persistence options. The
factory now selects SQLite/OPFS for that call. Supplying an own `indexedDB` property is the only way
to select the former implementation, making it an explicit legacy/test seam rather than an ambient
global fallback.

## Why one canonical KV envelope

The observed workload is identity lookup by `resumeKey`, followed by whole-job transitions:
acquire, start, complete/fail, reset interrupted work, acknowledge download, release, and delete.
There is no product query that filters or paginates recovery jobs. Correctness instead requires the
job, queue, lease fence, CAS revision, deterministic artifact list, and global budget to publish
together. One canonical SQLite value provides that boundary through the existing `kvSet` statement.

Structured tables become preferable only if measured evidence shows catalog parsing or rewrite cost
violating a release target, or if a product feature requires indexed cross-job queries. That change
would require a shared DB migration and is intentionally outside this store-scoped implementation.

## Binary protocol

1. Existing PNG/PSD integrity verification produces SHA-256 receipts.
2. The original bytes are written to the existing OPFS content-addressed store.
3. The returned `sha256:` address and byte count must exactly match the verified receipt.
4. CAS owner references are installed before catalog publication, favoring a recoverable leak over a
   catalog entry that points to deleted bytes.
5. The canonical SQLite catalog is published in one statement.
6. On restore, CAS bytes are read with hash verification and then pass the existing PNG/PSD structural
   verifier again before being exposed to the session.

No base64, data URL, engine object, Canvas, GPU resource, or Blob payload is serialized into SQL.

## Concurrency and crash rules

- A single named Web Lock serializes cross-tab read/modify/write cycles.
- Persisted owner, token, fence, expiry, and job revision are checked before every mutation.
- Takeover increments the fence; a stale session is rejected.
- A failed CAS/catalog commit does not advance the caller-visible session.
- A CAS write that precedes a failed SQL commit can leave an unreachable object, but the next acquire
  repairs owner references and mark-and-sweep can reclaim it.
- A running/failed item recovered after lease expiry is reset through the existing queue retry logic.
- Release is best effort; expiry and monotonic fencing remain authoritative.
- Corrupt or non-canonical catalog state, ledger mismatch, missing CAS bytes, and hash mismatch fail
  closed. Partial jobs are never returned.

## Legacy and fallback policy

- Product boot never reads the old IndexedDB database.
- There is no automatic migration marker or background copy.
- Explicit `indexedDB` injection remains for legacy import tooling and the established regression
  suite only.
- If a durable plan cannot obtain a safe Web Locks fence, the existing explicitly labelled
  current-tab memory mode is used; an ambiguous SQLite read/write failure does not silently split
  authority.

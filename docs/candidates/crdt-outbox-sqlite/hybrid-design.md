# CRDT outbox SQLite hybrid design

## Decision

Use structured v5 SQLite tables in the shared `studio-local-v12.db`, retain the existing
`StudioCrdtOutbox` API and same-page scoped serializer, and keep an explicitly degraded in-memory
copy only until an authoritative server ACK removes it. A whole-queue KV envelope was rejected
because separate read and write transactions cannot preserve concurrent writer semantics.

## Product data flow

```text
local Yjs update
  -> stable StudioCrdtUpdateRequest(updateId, clientSequence)
  -> same-tab emergency copy (bounded, never labelled durable alone)
  -> acquireStudioLocalDatabase()
  -> BEGIN IMMEDIATE
       check ACK tombstone
       check same updateId payload identity
       count pending rows + SUM(payload_bytes)
       INSERT pending row
     COMMIT
  -> ordered publish/retry
  -> authoritative server ACK
  -> BEGIN IMMEDIATE
       INSERT/retain ACK tombstone
       DELETE pending row
     COMMIT
```

The server receipt still owns publication idempotency. SQLite owns only the browser-local pending
frontier and retry diagnostics; it does not store a renderer object, engine object, CRDT runtime, or
server document snapshot.

## Transaction and concurrency semantics

- Public operations for one authenticated `scope + work` continue through
  `SerializedStudioCrdtOutbox`, so replacement bindings wait behind an in-flight operation and
  preserve the current API's late-put/ACK ordering contract.
- Each SQL mutation additionally uses `BEGIN IMMEDIATE`. Independent database writers therefore
  cannot interleave queue usage checks with the corresponding insert or ACK insertion with delete.
- Enqueue checks the ACK table first. An update ID acknowledged by another writer cannot be
  resurrected by a later enqueue.
- Re-enqueueing the exact same canonical payload is idempotent. Reusing the update ID with a
  different sequence or payload is corruption and fails without overwriting the original.
- Retry metadata updates only when the incoming attempt count is at least the stored count. A stale
  writer cannot replace newer diagnostics or reorder the queue.

## Failure boundaries

| Failure | Result |
|---|---|
| SQLite/OPFS open or write unavailable | Operation surfaces an error; same-tab emergency copy stays and status is `degraded` |
| Capacity exceeded | No pending row is evicted; incoming same-tab copy remains visible; explicit capacity error |
| Malformed SQL row or non-canonical request JSON | `StudioCrdtOutboxCorruptionError`; room boot enters its existing fail-closed recovery boundary |
| ACK insert succeeds but pending delete fails | SQLite rollback removes the ACK insert and keeps the pending row |
| Duplicate update ID with different payload | Transaction abort; original row remains byte-identical |
| Retry metadata write fails | Collaboration retry still proceeds, while binding emits a durability-risk status |
| Product starts after cutover | Only V12 SQLite is read; old IndexedDB is not discovered or migrated |

## Retry metadata

For retryable publication failures the room binding records:

- monotonic `attempt_count`;
- `last_attempt_at` and computed `next_retry_at`;
- bounded stable error code and diagnostic message.

These fields are diagnostics and recovery scheduling evidence. Queue order remains based only on
the original `client_sequence`, `created_at`, and `update_id`.

## Legacy and emergency seams

- `LegacyIndexedDbStudioCrdtOutbox` is an explicit import/test seam. Product construction never
  creates it and never opens `toonspectrum-studio-crdt-outbox`.
- No automatic copy, merge, salvage or deletion of old IndexedDB rows occurs.
- The emergency map is same-page only, bounded, and always accompanied by a degraded durability
  status when SQL did not commit.

## Known limitations

- ACK tombstones are intentionally retained to prevent cross-writer resurrection. A proven,
  server-receipt-aware bounded GC policy is not implemented yet.
- Real Chromium OPFS multi-tab lock contention and Worker termination are not measured here.
- Retry metadata is preserved but startup scheduling still follows the room binding's current
  in-memory retry clock; this change does not advertise durable background sync.
- CRDT convergence under concurrent offline edits, actual server dedupe and CSP blind production
  workflows remain external gates.

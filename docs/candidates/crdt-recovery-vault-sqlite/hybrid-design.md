# CRDT recovery vault SQLite hybrid design

## Decision

Use a bounded structured v6 table in the existing shared SQLite/OPFS database for all permanent
rejection markers and recovery frontier authority. Retain only a module-memory marker latch to stop
the current page immediately before the asynchronous SQL commit. The latch is explicitly ephemeral:
it cannot satisfy the preserve promise, cannot unlock cleanup, and cannot be advertised as surviving
reload.

## Product data flow

```text
authoritative server permanently rejects update
  -> collaboration binding enters terminal recovery-required state
  -> same-page marker latch (immediate, ephemeral)
  -> acquireStudioLocalDatabase()
  -> requireStudioCrdtRecoveryDatabase()
  -> BEGIN IMMEDIATE
       scoped usage + replacement delta
       enforce row/byte bounds
       INSERT permanent-rejection row
     COMMIT
  -> for each bounded frontier chunk
       BEGIN IMMEDIATE + bounded INSERT chunk + COMMIT
  -> BEGIN IMMEDIATE + INSERT frontier-manifest + COMMIT
  -> recovery export becomes available
  -> optional manifest status replacement to exported
```

The recovery vault is deliberately separate from the resend outbox. It is a non-retrying local
source for exporting rejected optimistic edits. The server remains authoritative for document
acceptance and publication; OPFS is local durability, not cloud backup.

## Ordering and crash semantics

- The collaboration binding calls `preserveRejectionMarker` before `preserve`.
- The page latch is installed before awaiting SQL, preventing the current binding from resending
  while the durable write is in flight.
- A marker write failure rejects with degraded durability. Memory never converts that failure to
  success.
- Chunks commit in ascending `chunkIndex`; the manifest commits last.
- A crash before the manifest leaves orphan chunks. Scoped list detects any chunk without a
  manifest and fails closed; it never returns a truncated frontier.
- A manifest validates exact chunk count, contiguous indices, and total update count before public
  assembly.
- Export status replaces only the validated manifest row. If replacement fails, the prior
  `pending-export` manifest remains authoritative and downloadable.
- Scoped public entries are sorted by `createdAt`, then `vaultId`; chunk assembly is sorted by
  `chunkIndex`.

## Row validation

The SQLite adapter validates before returning a row:

- requested scope and work match the stored columns;
- row key, kind, payload, byte count, and timestamp have bounded expected types;
- UTF-8 payload bytes exactly match `payload_bytes`;
- JSON parses and satisfies the marker/chunk/manifest schema;
- payload scope/work/key/kind exactly match the SQL identity;
- every embedded CRDT update passes the persisted protocol parser for the expected work.

Any mismatch throws `StudioCrdtRecoveryCorruptionError`. The caller does not receive the remaining
valid rows, because a valid subset could forget the rejection boundary that prevents resend.

## Failure boundaries

| Failure | Result |
|---|---|
| Shared SQLite/OPFS unavailable | `StudioCrdtRecoveryDurabilityError` with `durability: "degraded"`; product keeps recovery locked |
| v6 capability missing | Same typed degraded failure; no fallback to shared KV, localStorage, or IndexedDB |
| Marker commit fails | Preserve rejects; same-page latch remains; outbox cleanup stays at risk |
| Chunk commit fails | Previously committed marker/chunks remain; no manifest is written |
| Manifest commit fails | Frontier is not exportable; subsequent scoped list fails closed on orphan chunks |
| Capacity exceeded | Incoming row rejects; existing rows are never evicted |
| Corrupt row/identity/byte count | Typed corruption failure; no partial list |
| Export-status replacement fails | Original pending manifest remains durable and downloadable |
| Legacy browser-KV data exists | Ignored by product boot; no automatic migration or merge |

## Concurrency

Each capacity check and upsert runs under `BEGIN IMMEDIATE`, preventing two database writers from
both accepting capacity based on the same stale usage. The primary key makes one logical row
identity stable. A key cannot change row kind. Independent row commits still permit a crash between
chunks by design; manifest-last validation turns that condition into a fail-closed recovery lock
instead of a partial success.

## Known limitations

- The current same-page marker map has page-lifetime growth; durable limits do not cap this
  ephemeral emergency latch. A later cleanup hook may remove markers only after the binding is
  definitively replaced or closed.
- Browser OPFS multi-tab contention and forced Worker termination are not yet measured.
- No garbage-collection policy for exported frontiers is added. Recovery data is not silently
  deleted to satisfy capacity.
- No automatic IndexedDB/localStorage migration is provided. Explicit user-directed salvage would
  require a separate reviewed tool and must not run at boot.
- Cross-device backup, Yjs convergence, server dedupe, and renderer/task quality remain separate
  product gates.

# Mannequin and BG3D LT preset SQLite hybrid design

## Authority layout

```text
studio-local-v12.db
├── studio-mannequin-state-v12 / state-v1
└── studio-bg3d-lt-user-presets-v12 / library-v1
```

The split is payload-driven:

- SQLite/OPFS owns durable canonical state.
- React owns the current tab's optimistic working copy and explicitly labels failed durability.
- Mannequin JSON files remain explicit interchange and the only supported old-data ingress.
- The old mannequin key and BG3D LT storage adapter remain test/import seams; product boot never
  resolves `window.localStorage` for either authority.

## Canonical contracts

### Mannequin state

- Exactly one `{ params, pose }` document, encoded by the existing version-1 mannequin serializer.
- Maximum 24 KiB UTF-8.
- Exact body parameter, pose, joint and pelvis fields; future or unknown fields are rejected.
- Non-finite or out-of-range typed data that would need silent clamping is rejected before write.
- A SQLite row must parse and serialize to the identical byte string, so pretty-printed, reordered,
  lossy or corrupt rows are not accepted.

### BG3D LT preset library

- Existing strict `toonspectrum.bg3d-lt-presets` version-1 payload.
- Maximum 32 entries and 64 KiB UTF-8.
- Exact preset fields, stable IDs, NFKC text limits, unique IDs and built-in-ID exclusion.
- Line and tone values reuse the strict scene-document serializer; camera, model, light and runtime
  engine objects cannot enter the row.
- Presets remain sorted by ID and the SQLite row must equal canonical serialization byte for byte.

## Concurrency and lifecycle

Both repositories own an independent promise tail. Every save validates a complete snapshot before
joining that tail, so an earlier slow write cannot overtake a later invocation.

The product UI adds generation fencing:

1. Opening starts async hydration and records both hydration and mutation generations.
2. A late load is ignored after close, unmount, reopen or any newer mutation.
3. LT mutations apply a complete optimistic snapshot, then enqueue its canonical SQLite write.
4. Only the latest write generation may publish success or failure copy.
5. Mannequin close stops live tracking, waits for a stable snapshot, and closes only after durable
   success. If the state changes while saving it retries the newest complete snapshot up to the
   bounded stability limit.
6. A write failure never discards the current tab's state and never reports success.

## Failure semantics

- Missing rows mean first use, not corruption.
- Present corrupt/noncanonical rows throw an `invalid` repository error and remain untouched for
  forensic recovery.
- SQLite/OPFS open/read/write failures throw `unavailable`; there is no IndexedDB or localStorage
  downgrade.
- Mannequin keeps the dialog open with JSON export available.
- BG3D keeps the optimistic preset list usable as memory-only and permits an explicit retry on the
  next mutation.

## Measured production execution

The browser harness preserves the product boundary rather than opening a benchmark-only store:

```text
Vite production page
  → module Dedicated Worker
  → acquireStudioLocalDatabase(() => openStudioLocalDatabase({ vfs: "opfs" }))
  → option-free mannequin and BG3D repository factories
  → studio-local-v12.db KV namespaces
```

The normal phase opens once, writes each schema-maximum fixture 100 times, closes the shared
runtime, reopens the same SAH-pool database, verifies exact bytes/SHA/semantics and loads each row
100 times. The recovery phase writes both complete rows in a separate Worker, publishes committed
raw-byte receipts without closing, is forcibly terminated by the page, and is verified by a third
Worker. Both paths passed. Constructor instrumentation recorded two normal OPFS opens, one seed open
and one recovery open, all `/studio-local-v12.db`; it recorded zero `:memory:` or other memory DB
opens. Dedicated Workers exposed no localStorage API.

The raw result keeps all 400 latency samples, nearest-rank p50/p95/p99, canonical byte counts and
SHA-256 digests. It also preserves literal `null` for unavailable memory APIs so this design makes
no unsupported peak-memory claim.

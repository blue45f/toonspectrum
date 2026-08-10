# BG3D shot-batch recovery SQLite/OPFS benchmark and fault plan

## Committed automated gates

The focused test file is
`src/domains/creator/studio-bg3d-shot-batch-recovery-store.test.ts`.

It currently covers:

1. the original 23 memory/IndexedDB recovery contracts;
2. real sqlite-wasm named-VFS close, reopen, and completed-shot restoration;
3. default product boot ignoring a completed legacy IndexedDB job;
4. torn/non-canonical SQLite catalog rejection;
5. OPFS CAS byte modification and SHA-256 rejection;
6. serialized contenders, lease expiry takeover, and stale-writer fencing;
7. forced SQLite commit failure followed by recovery from the last committed running checkpoint;
8. deterministic catalog job ordering, completed-job acknowledgement, discard, and clean recreation;
9. SQL payload inspection proving that binary bytes/data URLs are absent and only CAS hashes remain.

Run only the focused gate with:

```bash
pnpm exec vitest run \
  src/domains/creator/studio-bg3d-shot-batch-recovery-store.test.ts
```

## Browser benchmark still required

The following must be measured in an actual Chromium Dedicated Worker with the product
`opfs-sahpool` VFS; no current number is claimed:

- cold database/CAS open;
- acquire and resume p50/p95/p99;
- start, checkpoint, complete, acknowledgement, and delete p50/p95/p99;
- 1, 16, and 64 active metadata jobs;
- 1 MiB, 32 MiB, 128 MiB, and bounded-total PNG/PSD payloads;
- JS heap, ArrayBuffer, SQLite WASM, and OPFS peak memory;
- CAS deduplication ratio and orphan sweep duration;
- two-tab lease contention and 10-second heartbeat jitter;
- quota exhaustion, tab kill during CAS write, tab kill before/after SQLite publication, and OPFS
  file corruption;
- 8-hour/24-hour repeated close/reopen soak.

Promotion requires zero partial recovery, zero stale-writer commits, deterministic queue/artifact
ordering, exact byte/hash restoration, and no automatic legacy read.

## 3D quality gates still required

Persistence does not change rendering. Nevertheless release evidence must pair restored outputs with
the existing BG3D archive verifier and compare original versus resumed PNG/PSD bytes, pass identity,
dimensions, color profile, depth/normal/ID semantics, and contact-sheet ordering. Physical GPU,
browser, OS, P3/HDR, and target-application PSD round-trip testing remain unmeasured here.

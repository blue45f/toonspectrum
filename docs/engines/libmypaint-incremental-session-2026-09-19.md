# libmypaint incremental session — 2026-09-19

Status: **implemented and tested package API; not yet a live product brush provider**.

The high-level session retains one brush and bounded surface across coalesced input batches.
The existing whole-stroke helper uses the same implementation. Valid corpus output remains
byte-identical to the committed goldens. Finish advances the configured tail once; subsequent
finish calls only read the final surface. Dispose is idempotent.

A batch is validated completely before any of it enters WASM. Time must be nonnegative and
nondecreasing. Accepted samples are copied into the session's last-sample snapshot, so later
caller mutation cannot change the release tail. Native failures invalidate the session and
release its handles; failure during one cleanup does not prevent the other cleanup attempt.

The pinned bridge seeds libc's module-global RNG. The high-level API therefore permits only
one active stroke per WASM module. Finish or dispose releases that lease. Separate modules
can run independently; raw native calls outside this API must not interfere with its lease.
Dimensions are capped at 4096 and surface area at 4,194,304 pixels (16 MiB RGBA8 output).
Native fix15 storage, temporary buffers, and the WASM heap are additional memory costs.

## Verification

```sh
pnpm --filter @toonspectrum/studio-brush-platform typecheck
pnpm exec vitest run packages/studio-brush-platform --maxWorkers=1
```

Observed: 302 passing tests, 3 existing opt-in tests skipped. The skipped checks belong to
`ink-modeler-browser-probe.test.ts`, `ink-modeler.test.ts`, and `ink-mesh.test.ts`, not the
libmypaint session suite. All 14 real-WASM parity/session tests and 7 new failure-boundary
unit tests passed. Timing is machine-dependent and was not used to claim a performance win.

## Remaining integration

The native bridge still exposes a complete-surface RGBA8 read. This must not be called on
every pointer event in a production live path. Remaining work includes packed dirty-region
native readback with a reproducible WASM rebuild, Worker ownership/backpressure, explicit
brush selection and payload preservation, and live/commit/undo/save/reopen acceptance.
No product fallback or automatic Hokusai/libmypaint switch is introduced by this change.

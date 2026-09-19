# Native brush preview and scoped engine session — 2026-09-19

Status: **current product inspector integration**, not main-canvas live input authority.
Continues merged PR #1840 without changing existing default live brushes, document formats,
production deployment settings, engine versions, resolution, color handling or source sensors.

## User workflow

The selected-freehand/drawing inspector now offers **결과 미리보기** followed by
**미리보기 적용**. Preview captures a document mutation ticket, renders using the selected
real engine, and displays the validated PNG without editing the document. Apply uses that
exact PNG and single-use ticket; it does not re-render and hope that the result is identical.
An intervening source/history/page/lock change prevents application. The existing
**선택 획 변환** immediate-conversion action remains available.

The preview renders at native crop dimensions and displays the source opacity. Closing the
panel, changing the source/style or leaving the page discards the visible preview. Original
source strokes are still preserved by the existing single history commit (hidden only after
successful application); save/reopen and SVG export still handle an ordinary PNG image.

## Scoped reuse and resource bounds

**연속 미리보기 가속** is enabled by default but does not initialize an engine on mount or
on opening the panel. Only an explicit preview/conversion starts a Worker. The scope is a
mounted inspector instance, not a global pool and not a cross-project cache. Turning it off
uses the original one-shot product API, which disposes the Worker after every conversion.

One session permits one active request and at most one selected engine. Success can retain
that engine for a later explicit operation in the same panel. Each operation creates fresh
libmypaint brush dynamics, resets its seed and pixel surface, and uses a new vector scene;
completed native stroke handles and input arrays are released. Surface dimensions may
change between settled operations without reinitializing the engine. Vello explicitly
reconfigures its canvas; CanvasKit recreates the surface when its dimensions differ.

Retention ends after 15 seconds idle, two minutes absolute lifetime, or 32 successful
operations. Timers and an acquisition-time clock check both enforce expiry. A hidden tab,
pagehide, closed panel, page/engine/scope change, unmount, explicit cancellation or error
releases the lease. Cancellation aborts in-flight work and invalidates late results.
Failure never tries another provider or retries the same operation; a later user action
may explicitly create a new session. Stale/overlapping requests cannot overwrite a current
result or silently queue unbounded work.

Engine GPU/WASM capacity and bounded renderer caches may remain resident while the lease
is alive. This is NOT a zero-native-memory or zeroized-buffer claim. Worker termination is
the final lifetime boundary; per-provider total resident GPU/WASM memory was not measured.
A session must not be promoted to a singleton or have its retention bounds widened without
new lifecycle and memory evidence.

Relevant platform contracts were checked against MDN: Worker.terminate ends work immediately
rather than waiting for pending operations, visibilitychange identifies a hidden document,
and GPUCanvasContext.configure defines the explicitly selected presentation surface:
https://developer.mozilla.org/en-US/docs/Web/API/Worker/terminate
https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilitychange_event
https://developer.mozilla.org/en-US/docs/Web/API/GPUCanvasContext/configure
These support cleanup design, not performance numbers or complete cross-browser compatibility.

## Measured performance: initialized repeated use, not first use

Chrome 153.0.8010.48 / Apple M2 Max / 32 GiB / Darwin 25.6.0. Three workloads and
three engines were measured 20 times after three warmups. The matched fresh and scoped
runs both group one engine per block, so comparisons do not mix differently interleaved
providers. Scope initialization occurs in the first warmup for each block. Fresh mode still
creates a Worker for every conversion. The scoped candidate was measured twice.

Numbers below are milliseconds from product conversion call to validated PNG/data-URL return,
including client digest work but excluding later image decode/diagnostic pixel hashing.
These are **warm repeated-conversion measurements**. The first preview and the first operation
after expiry/engine change still pay initialization and compilation cost. They are not
physical pen latency, live FPS, paint-to-display latency, or a claim that one engine is
universally faster or artistically better than another.

| Workload | Engine | Fresh p50 | Scoped p50 | Reduction | Fresh p95 | Scoped p95 | Repeat scoped p50 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| short-64-12px | libmypaint | 16.6 | 2.8 | 83.1% | 17.5 | 3.4 | 2.8 |
| short-64-12px | canvaskit | 91.9 | 3.6 | 96.1% | 99.7 | 4.8 | 2.9 |
| short-64-12px | vello | 93.6 | 4.1 | 95.6% | 95.9 | 5.2 | 3.9 |
| long-1024-48px | libmypaint | 25.4 | 9.1 | 64.2% | 26.3 | 10.4 | 9.3 |
| long-1024-48px | canvaskit | 95.8 | 8.8 | 90.8% | 99.3 | 10.0 | 8.6 |
| long-1024-48px | vello | 98.6 | 9.5 | 90.4% | 101.6 | 11.1 | 9.3 |
| dense-4096-128px | libmypaint | 35.7 | 16.9 | 52.7% | 37.2 | 18.2 | 16.4 |
| dense-4096-128px | canvaskit | 105.0 | 17.2 | 83.6% | 106.1 | 18.6 | 17.3 |
| dense-4096-128px | vello | 113.3 | 19.7 | 82.6% | 119.6 | 20.8 | 19.8 |

All nine matched engine/workload pairs retained identical decoded RGBA SHA-256, PNG byte
length and dimensions in every measured repetition, including the repeated scoped run.
The warm benchmark recorded initialization skipped for every measured repetition, with
9 Workers created across 207 total conversions per run (including warmups), versus 207
Workers in the matched fresh run. At no point did either runner use more than one Worker;
all were terminated at the end. Primary comparison plus repeat covers 621 conversions and
540 measured samples. Additional old-parent/fresh controls also retained exact pixel hashes.

This is a sequential same-host experiment, not a randomized build A/B or a significance test.
Browser/GPU JIT caches, context reuse and ordinary machine load are part of the observation.
The reports include raw samples, load averages, browser, input/pixel hashes, initialization
versus render timings and the actual compiled Worker name. Small repeat-run differences
(e.g. short CanvasKit 3.6ms versus 2.9ms) must not be presented as a universal guarantee.

## Verification executed

- Focused engine/geometry/document/inspector/export regression: **830 passed, 3 pre-existing
  optional Google Ink tests skipped**; 49 passed files and one entirely skipped file.
- New session tests cover one-engine reuse, resize/config handoff, idle/absolute/count bounds,
  delayed timer execution, cancellation, disposal during initialization, overlap rejection,
  failure isolation and late-result rejection. Inspector tests cover exact preview application,
  stale tickets, style changes and scope/visibility teardown.
- Standard frontend/API TypeScript, brush-platform, Skia and benchmark-harness type checks
  passed; changed-source strict lint passed. One preliminary bare tsc invocation hit Node's
  default 4 GiB heap; the repository's standard 12 GiB typecheck script was then used and passed.
  No product memory-limit or validation settings were changed to conceal that invocation error.
- Full production build, third-party notices and static CSP verification passed. Existing
  large-chunk, wasm-vips and Three/VRM warnings remain visible and are not claimed fixed.
- Actual Chrome, both development and compiled Worker: three successive previews per engine
  used one Worker, left the original untouched, and applied the exact shown PNG. Panel close
  released the lease. A stale preview ticket was refused.
- Real Worker parity additionally compared four successive size/color/style/seed cases per
  engine against independent fresh-worker PNGs, including small→large→small crops. All exact.
  Invalid native input evicted the Worker without retry; a new explicit operation restarted
  cleanly. A shortened 30ms test override verified the actual idle timer; the product remains
  15000ms and fake-clock unit tests also cover its real bounds.
- Existing one-shot conversion, canonical save/reopen, fixture-history Undo/Redo, SVG PNG
  embedding, cancel and prior native trial/dirty-frame regression passed. Actual document
  verifier: 29 Workers created sequentially, peak 1, remaining 0, page/CSP errors 0.

The browser harness uses the actual inspector, Worker, transaction planner, canonical codec
and SVG exporter with an **isolated history host**. It does not certify full Studio application
E2E, physical tablets/mobile performance, OPFS crash recovery, or cross-device pixel identity.

## Reproduce

```sh
pnpm run typecheck
pnpm run build
node scripts/verify-studio-native-brush-document.mjs --built-worker
node scripts/verify-studio-native-brush-probe.mjs --built-worker
node scripts/benchmark-studio-native-brush-document.mjs --built-worker --engine-blocks --label=session-fresh-matched --trials=20
node scripts/benchmark-studio-native-brush-document.mjs --built-worker --session --label=session-warm --trials=20
node scripts/benchmark-studio-native-brush-document.mjs --built-worker --session --label=session-warm-repeat --trials=20
node scripts/compare-studio-native-brush-benchmarks.mjs session-fresh-matched session-warm
node scripts/compare-studio-native-brush-benchmarks.mjs session-fresh-matched session-warm-repeat
```

Raw JSON, per-sample receipts and screenshots stay under ignored `.qa/engine-resume/`.
Measurements were taken before committing the patch: report HEAD is parent
25ccccb9681e5074da2ebbb9a1a86efbfbc2a3e5 and dirtySource=true, with the compiled candidate
Worker `studio-native-brush-probe.worker-tRvXx6aW.js`. Do not label them as a different binary.
Raw report integrity:

- `native-brush-benchmark-session-baseline.json`: `813f764640b34917ad2ca911fda268d57bc7d80c8cbb239d0808db7285f5fd67`
- `native-brush-benchmark-session-fresh.json`: `d8d631b9f9b88d0ed020f8de75ede03dc98230bfb3993ff4212c7b0c5f9f64ef`
- `native-brush-benchmark-session-fresh-matched.json`: `367daa803a68a0632e6c14b86378d568f3e8c1ef9e10d4276a17966939d1d943`
- `native-brush-benchmark-session-warm.json`: `125639e61d686ebcbd7c7287e15d443f73f1f0e4bbf9217be7a896edf967f430`
- `native-brush-benchmark-session-warm-repeat.json`: `21d75903d82266c176f54b35119fca02eb5c6644c4d2abcb99d256c89b891d81`

## Remaining work

Native MYB preset payload preservation, broader natural-media recipes, sparse large surfaces,
and direct main-canvas live input/mixed-engine handoff remain separate capabilities. This
change makes repeated native comparison and confirmed document application faster; it does
not silently promote any provider to the live primary renderer. No deployment was executed.

# Scene3D bounded high-resolution shot output — 2026-09-20

## Scope

Continues the approved Scene3D design's high-resolution output work, separately from the active
source/derivative comparison session. PR #1849 was already merged. This branch starts from
`9ceb6d9b25432574c7a28bc9fc424de3e4a343ee` and integrates main `5d1cd7ace` before release validation.
Other worktrees, their dirty files and locks remain untouched.

This is a functioning **up-to-4096-pixel PNG/LT saved-shot output** slice, not a completed 89-task
roadmap, full NPR renderer, general 8K engine, material-ID pipeline or 4K layered PSD implementation.
There are no new runtime or development dependencies and no new canonical scene/storage authority.

## Artist workflow

Use the existing view panel's saved-shot batch export and its per-shot/4096 height controls.
Three adapters with the new explicit tile capability can produce a complete output up to
4096×4096. Wider/taller aspect ratios still obey the existing 4096 longest-edge limit, which can
reduce requested height; that reduction remains in the existing artifact manifest.

The current color/beauty, line, texture-line, tone, LT-composite and normalized depth-PNG pass
semantics are retained. Geometry normals are captured for crease computation; this change does
not add a downloadable high-precision normal/depth or object/material-ID pass.

Large outputs use the existing ZIP, per-shot recovery, authorization, cancellation and scene-
restoration workflow. The old single-raster encoder remains in use for small outputs. The owner
therefore declares an **adaptive canvas-or-stream** PNG profile rather than falsely labeling every
small output as streamed. Recovery identity also includes the selected core tile dimensions.

Layered PSD keeps its existing full-layer memory budget. Large tiled output reports the existing
`budget` fallback and exports PNG passes instead of silently allocating full-size PSD layers.
Small-shot PSD still uses the unchanged product path; its actual browser outcome is recorded in
verification rather than assumed to succeed.

## Allocation boundaries

The existing single-raster depth/LT limits and the normal-inclusive conservative 80-byte/pixel,
320 MiB capture admission are unchanged. Complete-image pixel allowance is separate from the
per-tile allocation allowance.

Default core tiles are 1024×512, with a clipped 12-pixel halo. A 4096-square image uses 32 tiles;
the largest guarded target is 1048×536 = 561,728 pixels. Lower device profiles reduce tile core
sizes until the complete guarded tile fits the **same** per-capture pixel budget. The profile's
tile shape is hashed into recovery identity. Unrecognized/non-Three profiles cannot claim the
larger complete-image budget in either private plans or public archive validation.

The worker holds one row band per requested pass, not a full raw image. A 4096-wide, 512-row RGBA8
band occupies 8 MiB per pass; seven bands occupy 56 MiB. Compression uses bounded groups of at most
32 scanlines and real writable-stream backpressure. Compressed PNGs remain bounded at 24 MiB each;
the existing complete archive budget remains enforced before per-shot commit.

These are explicit allocation/accounting limits, **not measurements of total browser or GPU
resident memory**. Scene assets, retained renderer pools, other features/tabs, codec internals and
encoded archive blobs remain separate. No physical-VRAM, FPS or 30-minute-soak claim follows.

## Camera and renderer ownership

A tile session freezes the current projection and parent-applied world camera transform. It crops
the projection matrix, preserving perspective/orthographic projection, zoom, lens shift and an
already active view offset. It does not reconstruct a nominal lens from incomplete settings or
mutate the live editor camera. Camera children are not recursively cloned into temporary sessions. One reusable tile camera identity
is kept per session so Three does not create a separate camera-dependent render cache for every tile.
Each crop starts from the frozen original projection, never from the previous tile.

Three WebGPU changes a fresh camera's clip-space convention on first render and can recompute its
projection. The tile camera explicitly converts only clip Z to the target convention beforehand,
so the renderer cannot discard the cropped projection. Reversed-depth rendering remains explicitly
unadmitted rather than being silently converted incorrectly.

Tiles use the same admitted Three renderer and existing color/depth/normal capture paths. No
secondary rendering engine, canvas screenshot fallback, preview quality downgrade or global
resource-budget relaxation is introduced. Existing renderer state/fence/disposal tests remain active.

One GPU tile is captured and read back, then the main thread waits for one correlated worker
acknowledgement before requesting the next. Capture generation, adapter/viewport identity, source
viewport dimensions and shared-character lease are revalidated around asynchronous boundaries.
The saved-shot runner keeps its animation freeze/capture lock and restores the original document
and live view. This is not a new immutable copy of arbitrary mutable shader or simulation state.

## Global line and tone coordinates

The pure LT kernel accepts an optional full-image pixel window. Pattern/noise phase uses absolute
image coordinates and scale-aware thresholds use full-image dimensions. The 12-pixel halo covers
the currently bounded line/blur/edge neighborhood; only the tile core is composited into the output.
Any future increase to those kernels must revisit this halo and its regression corpus.

Identical synthetic input rasters are compared whole-frame versus tile-by-tile for dot, line,
crosshatch and noise patterns, maximum line width/smoothing, depth and normal creases. Output differs
by at most one byte from reference compositing in those tests.

Actual GPU rasterization is **not claimed bit-identical**: reprojection and triangle boundary tie-
breaking can move a few edge pixels. Browser evidence records the maximum, mean and affected-pixel
counts per pass. The comparison tolerance is fixed in the verifier, not hidden by overwriting a
baseline. A low mean does not erase the existence of high-contrast one-pixel edge differences.

## Streaming PNG and worker protocol

The encoder emits a standard PNG signature, RGBA8 IHDR, sRGB chunk, CRC-framed chunks,
streamed zlib IDAT chunks and IEND using the browser's native `CompressionStream("deflate")`.
It retains no full raw frame or full-size 2D canvas for encoding. Tests independently inflate and
reverse the Sub filter across row bands; browser image decoding verifies real files and dimensions.

The isolated module Worker accepts one exact init envelope, ordered tile messages and finish.
Replies are correlated by version/job id/tile index with exact fields. Duplicate/out-of-order
messages, missing/unexpected depth or normals, invalid dimensions, excessive bytes, wrong PNG
headers, incomplete results and skipped-pass inconsistencies fail closed.

Cancellation terminates the processing Worker and stops further tile submission. Already-submitted
GPU copies remain the existing renderer adapter's fence responsibility; targets are not disposed
mid-copy by the new session. No incomplete image or partial current-shot archive is committed.
A timed-out phase rejects rather than extending its watchdog on status messages. This is a per-
phase deadline plus bounded tile count, not a promised fixed wall-clock deadline for an entire batch.

## Compatibility boundaries

Built-in admitted mesh materials are the initial supported surface. Visible points/sprites,
custom shader hooks, stochastic alpha hashing/dithering, custom node expressions, scene override
materials, and screen-space transmission are rejected because a local viewport can change their
meaning. Registered editor helpers are excluded and restored without modifying source visibility.

This does not certify all VRM/MToon, hair, animated/deformed assets, arbitrary procedural shading,
SSGI/SSR/DoF/temporal effects or cross-device output. Global-screen effects require a separate
full-frame prepass or an explicitly tiled algorithm; they are not silently disabled and claimed
as supported. The UI states the current restrictions.

## Saved-shot recovery and packaging

The browser proof exercises the **real existing batch runner**, camera application, background-
only character lease, private plan/recovery store, tile worker, PNG/PSD paths, archive worker,
public manifest and archive verifier under a controlled synthetic host. It is not whole-site
R3F/UI/authorization integration certification.

The test cancels after the first tile and expects no archive; retries to produce a 4K shot and a
small shot; then runs again and verifies already committed artifacts are repackaged without any
new capture call. Canonical source and camera must be restored after both cancellation and success.
Recovery is the existing tab-memory mode in this fixture. No new per-tile checkpointing, OPFS
persistence certification or distributed recovery system is introduced.

## Verification and known limitations

Final validation results and exact source hashes are recorded in the accompanying evidence JSON.
The earliest GPU/capture checks succeeded while the requested hardware probe exposed SwiftShader;
those attempts are failures for **hardware certification**, not native-GPU passes. Later lanes
must report their actually exposed adapter, not rely on the requested command-line flag.

An actual saved-shot proof found an omitted `await` around the existing lazy source-size reader.
It was corrected; identity checks now occur on both sides of that await. A test-only plan-id typo
was also corrected to the real `planDigest` field, preserving the intended recovery assertion.
Existing upstream build, readback and codec warnings are kept visible. Small PSD results/fallbacks
are inspected in the real ZIP manifest; 4K PSD is intentionally outside this implementation.

## Reproduction

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run verify:studio-3d-tiled
pnpm run verify:studio-3d-professional-completion
pnpm run build:bundle
SCENE3D_TILED_PRODUCTION_WORKER=1 SCENE3D_CAPTURE_GPU_LANE=swiftshader \
  node scripts/verify-studio-scene3d-tiled-output.mjs
```

The dedicated CI lane builds and serves the actual production tile Worker with the exact CSP from
`dist/_headers`. The surrounding verification page is a Vite harness, not an assertion that every
deployed route has been tested. PNG/ZIP screenshots and logs stay under the ignored `.qa` subtree.
No branch protection, hook, CSP, license/security check, or bundle baseline is bypassed. Main merge
and production deployment are not claimed by implementation or local validation alone.

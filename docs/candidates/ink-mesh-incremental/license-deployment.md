# Ink mesh incremental license and deployment

## Provenance and license

- Upstream: `google/ink`, module 1.1.0, commit
  `1d0daba661f3035f42f3649b8e6a0061b47aa759`.
- License: Apache-2.0.
- First-party boundary: `imk_bridge.cc` and `ink-mesh.ts`.
- Build dependency: abseil-cpp 20260526.0 under its upstream license.
- The direct-emcc subset contains 76 upstream translation units from
  types/color/geometry/brush/strokes. It excludes tests, JNI, tessellator,
  rendering, storage, Skia, Dawn, protobuf, and libtess2.

The incremental work adds no npm, Cargo, or system runtime dependency and
does not change a lockfile. The current notice/license process remains the
deployment authority.

## Artifact and deployment cost

| Artifact | Current bytes | Previous bytes | Delta |
|---|---:|---:|---:|
| `ink_mesh.wasm` | 541,737 | 538,378 | +3,359 (+0.62%) |
| `ink_mesh.mjs` | 16,681 | 14,999 | +1,682 (+11.21%) |
| Combined | 558,418 | 553,377 | +5,041 (+0.91%) |

The Emscripten target remains `web,worker,node`, uses growable linear memory,
has no filesystem, and performs no network access after loading the colocated
WASM. The module is loaded on demand by the brush platform rather than in the
application bootstrap bundle.

## Integrity and rebuild

`packages/studio-brush-platform/src/ink-mesh/INTEGRITY.sha256` pins README,
MJS, WASM, and bridge source. `scripts/verify-studio-engine.mjs` verifies this
manifest. Rebuild instructions and the exact export list are in the artifact
README. The generated MJS banner is part of the pinned bytes.

## Runtime safety

- Stable ABI point stride is 6 f64 values.
- Per-append and per-stroke limits are exported by WASM and rechecked in TS.
- Inputs reject NaN, infinity, float overflow, invalid pressure/tilt/
  orientation, optional-channel drift, and reverse time.
- Protocol application rejects stale revisions, malformed lengths, non-finite
  geometry, and out-of-range triangle indices.
- Product GPU admission additionally bounds points, vertices, triangles,
  geometry/delta bytes, backing pixels, and every subrange offset before
  `GPUQueue.writeBuffer`; the interactive path has no readback API.
- `cancel()`/`dispose()` destroy the C++ handle; a C status error faults and
  destroys it. `reset()` is the only supported reuse operation.
- Mandatory fallback is the retained single-shot generator.
- The product adapter leases the existing `StudioGpuFabric` device. Matching
  device loss destroys position/UV/index/uniform buffers, releases the lease,
  and leaves the existing Canvas2D/Perfect Freehand paint owner active.

## Deployment status

The incremental provider is technically validated for exact final quality,
real WASM execution, transient predicted replacement, and bounded live GPU
subrange upload in the actual `/studio` path. Product scope is deliberately
limited to the live predicted-tail mesh island: Canvas2D/Konva and Perfect
Freehand still own authoritative paint and commit.

Physical tablet/CSP blind evidence, multi-coat support, browser GPU timing, and
a Vello triangle-mesh paint-owner boundary remain quarantined rather than
reported as supported. No npm/Cargo dependency, package manifest, lockfile, or
central release document changed for this promotion.

# Studio retained-renderer final software migration closure — 2026-09-23

## Outcome

This closure completes the remaining software work that can safely move behind the retained Skia document boundary without changing document truth, permissions, Undo, persistence or export fidelity. It does not delete a compatibility renderer merely to claim a total engine replacement.

## Completed boundaries

### Retained display

- Exact causal pen/marker/final eraser dabs and pressure contracts.
- Existing admitted vector/path and panel contracts.
- Horizontal LTR solid text with bounded, declared font sources and glyph coverage.
- Static PNG/JPEG images with rotation, flip, opacity, admitted blend modes, bounded skew, rounded corners and one bounded shadow.
- A retained spatial hit index and one hit-only proxy while Skia owns document paint.
- Receipt-gated live-input and transform handoff; stale page/project/surface receipts cannot release transient pixels.

### Specialist final-pixel projection

The source program stays canonical. Filters, filter masks, layer masks, animated GIF/current browser frame and multi-frame sources are prepared as bounded immutable PNG leases only for the retained renderer. The cache is ref-counted, concurrency-limited and explicitly invalidates live-frame entries. Settled natural-media providers already commit final pixels through their provider receipts; those image elements therefore enter the same specialist boundary without inventing a second brush authority.

### Exact detached export

Supported pages use the same document projector on a detached CanvasKit surface. Export waits for the existing canonical capture-readiness gate, presents one exact revision at export scale, accepts only a matching `presented` receipt, snapshots PNG bytes and then reuses the established page-grade, watermark and format encoders.

The compatibility export remains an explicit correctness boundary for gradients, paper grain, page animation timelines, colour-proof projection, unsupported document elements, admission/resource failure and oversized backing stores. A fallback is labelled `konva-compatibility`; it is not silent output substitution.

### Offline collaboration proposal

- Yjs remains canonical for shared state, commands, Undo and persistence.
- Automerge is feature-gated and stores an offline proposal journal only.
- OPFS/local storage and peer bulk transfer are bounded and versioned.
- Promotion requires the existing reconciliation, role and lock path.
- Cooperative P2P mutation locks validate claims and fail closed when fanout is partial or unavailable, while a solo editor is not blocked by a nonexistent peer lease.

### Review sharing

Pinned review shares and showcases use immutable server identities. Review secrets are read from URL fragments, never local/session storage or logs. Public showcase routes receive no edit authority.

## Authority matrix

| Concern | Authority after closure |
| --- | --- |
| Source elements, strokes and commands | Existing Yjs/document model |
| Undo/Redo | Existing command/history authority |
| Local durable storage | Existing SQLite/OPFS stores |
| Retained document pixels | Skia only after exact visible receipt |
| Live input/active eraser/selection UI | Existing transient interaction owners |
| Filtered/masked/current-frame pixels | Established final-pixel worker/mask result, leased to Skia |
| Supported raster export | Detached exact-revision Skia document surface |
| Unsupported raster export | Existing canonical compatibility renderer |
| Offline proposal operations | Feature-gated Automerge journal |
| Canonical collaboration promotion | Existing role/lock/Yjs reconciliation |
| Publication/review share | Existing server-issued immutable contracts |

## Verification gates

The integration must pass, without budget relaxation:

```sh
pnpm run typecheck
pnpm run validate:architecture
pnpm exec vitest related <changed files> --run --pool=forks --maxWorkers=2
pnpm run build
pnpm run postbuild
pnpm run check:studio-bundle
```

The production preview is also exercised by the existing retained-renderer, multi-tab/mobile and soak verifiers. Their reports must include the actual renderer and preserve unsupported/failure evidence.

## Operational acceptance still required

Physical stylus latency, palm rejection, thermal/battery behaviour and OS memory-pressure recovery cannot be certified by a repository change or desktop emulation. The checked-in pressure and long-session harness makes those sessions reproducible, but final certification requires named physical devices and recorded 30/120-minute (or longer) runs. No production deployment is part of this closure.

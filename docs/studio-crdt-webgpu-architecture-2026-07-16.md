# Studio CRDT + WebGPU architecture — 2026-07-16

This document supersedes the blanket `deferred` descriptions for G9b and G10b in the
2026-07-15 benchmark notes. Both tracks now have production code. They remain progressive engine
rewrites rather than claims that every legacy scene type already runs on the new path.

## Status

| Track | Current status | Authority boundary |
| --- | --- | --- |
| G9b — realtime CRDT operations | **Shipped vertical slice** | Yjs is authoritative for strokes, scene references, pages, layer groups, mixed order, and delete/restore operations. PostgreSQL is authoritative for durable updates/snapshots and short edit leases. |
| G10b — WebGPU canvas | **Safe live-input slice** | WebGPU is authoritative only for a matching, complete live-draft frame. Committed document pixels remain authoritative in Konva until pixel parity and every Stage readback path share one contract. |

## G9b: convergent multi-user document

### Document model

- Pointer samples stream into nested Yjs arrays, so two artists can draw at the same time without
  replacing a whole page-sized bitmap.
- Strokes, referenced scene elements, pages, and layer groups use stable IDs and deterministic
  mixed z-order records. Delivery order does not change the final compositing order.
- Deletion uses a flat, grow-only observed-remove protocol. Each delete owns an immutable UUID
  operation and restore acknowledges only the delete operations the restoring peer observed.
  Therefore a concurrent unseen delete always wins and a delayed snapshot cannot resurrect work.
- Remote changes reconcile through every local undo snapshot while local operation ownership stays
  separate, preventing one artist's undo from removing another artist's operation.
- Image, VRM, and 3D content enters the CRDT as a bounded typed reference, not as a data URL or
  model blob. A client materializes it only against a same-ID, same-type local source.

### Server durability and multi-node behavior

- `studio:crdt:sync` returns a state-vector-based snapshot/update frontier; `studio:crdt:update`
  appends bounded binary updates and broadcasts accepted updates to the work room.
- Server-mode clients track the highest contiguous durable `serverSequence`. A gap observed in a
  remote update or local acknowledgement triggers an immediate state-vector repair; local
  BroadcastChannel counters are intentionally excluded from this durability check.
- Each update is at most 48 KiB. Stroke sample, collection, document, and deletion-log limits are
  validated before persistence.
- A per-work PostgreSQL transaction advisory lock serializes duplicate-receipt lookup, hydration,
  schema validation, receipt insertion, and update insertion. Validation failure rolls the entire
  transaction back, including under concurrent writers on different API nodes.
- Snapshots and incremental updates are staged into a temporary document. A corrupt durable update
  never partially mutates the live cache.
- Presence discovery uses the Socket.IO adapter across API nodes. WebRTC screen signalling is
  relayed to the exact target connection through bounded server-side RPC and is revalidated at the
  target node before delivery.
- Short resource edit leases are stored in `creator_work_live_lock`, use the PostgreSQL clock, and
  are serialized per work. Disconnect, role downgrade, explicit release, and expiry all remove the
  authoritative lease; owner and lease ID must both match.

### Intentional limits / next slices

- The shared document currently models drawing as semantic vector/stylus operations. A destructive
  raster-edit tool that rewrites existing pixels still needs an opaque, chunked tile operation
  format or conversion into non-destructive operations; it is not falsely merged byte-by-byte.
- A newly referenced remote image/VRM/3D asset needs a work-scoped upload/fetch and placeholder
  hydration lifecycle before a peer that never held the asset can materialize it.
- Production multi-instance deployment still requires a configured Socket.IO cluster adapter; the
  application now fails closed and has deterministic adapter-timeout behavior when it is absent.

## G10b: retained WebGPU drawing compositor

### Render path

- The compositor presents real pressure-aware normal and erase dabs through WebGPU pipelines.
- A tall document is split into stable 512 logical-pixel tiles. Only viewport tiles plus one row and
  column of overscan allocate textures; the default retained cache is bounded to 128 MiB / 256
  entries.
- Retained operation logs make unchanged tiles clean, append immutable operations, and rebuild only
  tiles whose historical coverage changed. An extending live stroke uploads only the bridge and new
  point suffix.
- Adjacent tiles derive their crop and bleed rectangles from the same globally rounded physical
  edges, eliminating fractional-scale seams.
- Presentation is viewport-bounded and tracks scroll, zoom, horizontal flip, and device pixel
  ratio. It does not allocate a texture the height of a complete scrolling episode.
- Queue completion carries an opaque request receipt. A stale, superseded, incomplete, lost-device,
  empty, non-finite, or over-budget frame cannot hide the authoritative Konva canvas.
- A fail-closed committed-suffix planner and exact scene/viewport authority snapshot are implemented,
  but Studio intentionally does not hide committed Konva nodes yet. The current Konva pressure
  renderer uses endpoint-width segments while the GPU compositor uses interpolated dabs; treating
  those as interchangeable would also omit GPU-owned pixels from Stage-only timelapse, animation,
  eyedropper, and asset-capture readbacks.

### Safety and fallback

- The exact visible frame is capped at 100,000 generated dabs. Offscreen work does not consume the
  visible-frame budget, but any visible truncation rejects the frame.
- Tile physical resolution is capped at 4x. If zoom × device-pixel-ratio needs more than that, the
  GPU path declines authority instead of approving a blurry preview.
- WebGPU initialization is single-flight and idempotent, lets the browser select a power-aware
  default adapter for mobile battery/thermal stability, destroys late device acquisition after
  cancellation, and invalidates every old-generation resource before device-loss recovery.
- Device loss also supersedes the old queue flight immediately. Monotonic flight ownership keeps a
  hung or late `onSubmittedWorkDone()` from blocking the recovered device or releasing its newer
  pending-render lock.
- Canvas2D remains the compositor-compatible fallback when WebGPU is unavailable. Konva remains the
  scene/interactions authority for unsupported images, text, bubbles, filters, selections, and 3D
  surfaces until their render contracts move to GPU passes.
- Committed ownership will be enabled only after an analytic endpoint-width segment pass, alpha and
  single-point golden-pixel parity, receipt ownership tokens, native-scroll pre-paint revocation,
  GPU-aware readback composition, and a top interaction overlay plane all pass together.

## Verification contracts

- CRDT: concurrent delivery-order convergence, progressive sample append, delete/edit and
  delete/restore races, mixed scene order, page/group topology, corrupt hydration, duplicate receipt,
  two-writer transaction rollback, durable sequence-gap repair, presence gap recovery, cross-node
  relay, and distributed leases.
- WebGPU: retained suffix upload, historical rebuild, visible-only tall-document planning,
  fractional tile edges, high-DPI quality rejection, empty/non-finite rejection, stale receipts,
  queue serialization/coalescing, hung-flight device-loss recovery, initialization cancellation,
  and Canvas2D fallback.
- UI smoke verification covers desktop and mobile immersive Studio layouts, bounded viewport
  surfaces, exact invalidation, and safe Konva fallback whenever a GPU frame is not authorized.

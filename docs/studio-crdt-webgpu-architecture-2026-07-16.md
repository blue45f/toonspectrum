# Studio CRDT + WebGPU architecture — 2026-07-16

This document supersedes the blanket `deferred` descriptions for G9b and G10b in the
2026-07-15 benchmark notes. Both tracks now have production code. They remain progressive engine
rewrites rather than claims that every legacy scene type already runs on the new path.

## Status

| Track | Current status | Authority boundary |
| --- | --- | --- |
| G9b — realtime CRDT operations | **Shipped vector slice + opt-in raster pilot** | Yjs is authoritative for vector/stylus scene operations and the immutable semantic raster log. PostgreSQL is authoritative for durable updates, snapshots, raster assets and short edit leases. The verified round-pen raster path requires paired deployment tokens. |
| G10b — WebGPU canvas | **Safe live-input + verified raster presentation slice** | WebGPU accelerates matching live drafts and verified raster tiles. Konva remains the durable fallback and interaction/readback authority; an exact idle/select-only front suffix is hidden only in the same commit that authorizes a complete raster frame. |

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
- Semantic raster operations are immutable, deterministically ordered, and reference
  content-addressed PNG patch assets. Paint, erase, fill, selection, filter, transform, merge and
  flatten contracts exist; the first product publisher intentionally emits only exact round,
  opaque, source-over pen operations.

### Server durability and multi-node behavior

- `studio:crdt:sync` returns a state-vector-based snapshot/update frontier; `studio:crdt:update`
  appends bounded binary updates and broadcasts accepted updates to the work room.
- Server-mode clients track the highest contiguous durable `serverSequence`. A gap observed in a
  remote update or local acknowledgement triggers an immediate state-vector repair; local
  BroadcastChannel counters are intentionally excluded from this durability check.
- Each update is at most 48 KiB. Stroke sample, collection, document, and deletion-log limits are
  validated before persistence.
- Each API process bounds the CRDT operation backlog, counting both active operations and queued
  waiters. The defaults admit at most 128 operations for one work and 512 operations across the
  process. Admission happens synchronously before the operation is attached to a work queue, so a
  saturated queue cannot begin a durable mutation or retain an unbounded promise/payload backlog.
- Saturation returns a recoverable `rate_limited` acknowledgement. The browser's ordered outbox
  backs off and retries the same idempotent update ID instead of reporting the rejected attempt as
  data loss or creating a duplicate durable update.
- Server acknowledgement codes survive the transport boundary. Retryable failures retain the same
  durable update ID. Permanent invalid/forbidden/revoked failures copy the dependent unsent frontier
  into a separate, non-retrying IndexedDB recovery vault before removing its resend copy, detach the
  optimistic document, and enter an explicit recovery-required fail-closed state instead of retrying
  forever or silently diverging. If the vault write fails, the resend copy is retained but the
  current binding remains terminal, so the rejected frontier cannot be replayed in that session.
- A local BroadcastChannel receipt proves only same-origin peer visibility. It never advances the
  authoritative ACK clock or removes the durable outbox entry; the same update ID stays queued until
  a server room acknowledges it. Recovery requires an explicit JSON export followed by a full reload
  of the server-authoritative document, and the normal retry/local-fallback controls are unavailable
  while that boundary is active.
- Recovery writes a small permanent-rejection guard before the full frontier. Large frontiers are
  stored as bounded chunks plus a commit-last manifest instead of failing at a fixed batch count;
  an orphan guard or malformed IndexedDB row locks reopening before any resend can occur. While a
  terminal boundary remains active, the provider keeps checking the vault with capped backoff, so a
  slow IndexedDB write still exposes the recovery export instead of disappearing after a fixed poll
  count.
- Shared-document save and publish acquire a client-side authoritative barrier: the final sub-frame
  batch is flushed, every pending operation must receive a server ACK, and one final state-vector
  repair must complete before the REST document snapshot is captured. A permanent sync/update
  rejection cancels that save and detaches the optimistic document.
- The barrier returns the exact PostgreSQL CRDT sequence and every shared-document PATCH must carry
  that canonical non-negative bigint value. The API takes the same per-work CRDT advisory lock,
  recomputes the maximum snapshot/update sequence inside the save transaction, and returns the
  dedicated `creator_crdt_sequence_conflict` 409 response if another writer advanced the frontier;
  a REST revision can therefore never silently commit against a stale CRDT snapshot.
- Deterministic server snapshot/update corruption uses the permanent `storage_corruption` ACK code.
  It is never collapsed into retryable `internal_error`, preventing an unrecoverable store from
  replaying the same update indefinitely.
- A per-work PostgreSQL transaction advisory lock serializes duplicate-receipt lookup, hydration,
  schema validation, receipt insertion, and update insertion. Validation failure rolls the entire
  transaction back, including under concurrent writers on different API nodes.
- Snapshots and incremental updates are staged into a temporary document. A corrupt durable update
  never partially mutates the live cache.
- Presence discovery uses the Socket.IO adapter across API nodes. Long-running Nest deployments can
  explicitly select the PostgreSQL adapter; boot verifies its migration table and a session-scoped
  `LISTEN` on a direct PostgreSQL endpoint before accepting traffic. WebRTC screen signalling is
  relayed to the exact target connection through bounded server-side RPC and is revalidated at the
  target node before delivery.
- Short resource edit leases are stored in `creator_work_live_lock`, use the PostgreSQL clock, and
  are serialized per work. Disconnect, role downgrade, explicit release, and expiry all remove the
  authoritative lease; owner and lease ID must both match. Lock protocol v2 rotates the public
  fence on every successful renewal and requires the prior fence as a compare-and-swap token, so a
  delayed release or renewal cannot remove or resurrect a newer lease.
- Lock revision protocol v1 assigns every committed per-work mutation a PostgreSQL `bigint`
  revision and returns a JOIN snapshot high-water mark. Browsers parse only canonical decimal
  revisions, retain a global snapshot floor plus per-resource watermarks/tombstones, accept
  out-of-order revisions for different resources, and reject stale same-resource broadcasts,
  acquire/release acknowledgements, regressing reconnect snapshots, or capability downgrade.
- Migration `0017_creator_work_live_lock_revision.sql` is a coordinated cutover: drain old Studio
  writers, apply the migration, then start revision-aware API instances. Its first application
  evicts only the short-lived lease rows under an `ACCESS EXCLUSIVE` lock, removes the revision
  default so old inserts fail closed, and records a durable schema-migration ledger row so a retry
  repairs clocks and constraints without evicting new revision-aware leases again. CreatorModule
  boot checks the table shape and ledger before accepting Studio traffic. The executable cutover,
  verification, retry, and emergency rollback sequence is documented in
  [`STUDIO-LIVE-LOCK-REVISION-MIGRATION.md`](./STUDIO-LIVE-LOCK-REVISION-MIGRATION.md).

### Intentional limits / next slices

- The semantic raster operation, asset, replay and WebGPU/Canvas2D presentation layers exist. Studio
  currently publishes only exact round opaque pen strokes and authorizes display only for an
  interaction-free topmost suffix. Erase, fill, selection, filter, transform, merge and flatten are
  not yet connected to every Studio tool even though their protocol contracts exist.
- A trusted coordinator is still required to compact the grow-only semantic raster log into stable
  checkpoint tiles; clients are intentionally forbidden from claiming checkpoint authority.
- A newly referenced remote image/VRM/3D asset needs a work-scoped upload/fetch and placeholder
  hydration lifecycle before a peer that never held the asset can materialize it.
- Multi-instance operation requires `STUDIO_LIVE_CLUSTER_ADAPTER=postgres`, a LISTEN-capable direct
  `STUDIO_LIVE_POSTGRES_URL`, and migration `0009_socket_io_postgres_adapter.sql`. The adapter uses a
  bounded dedicated pool and fixed attachment table/channel names, fails boot until both required
  namespace LISTEN subscriptions are ready, reconnects by replacing the failed listener and
  resubscribing every namespace, and closes Socket.IO then PubSub then its pool. URL query overrides
  are fail-closed. Default `memory` mode deliberately remains process-local.
- The PostgreSQL adapter is attached only by the long-running Nest entrypoint. The Vercel serverless
  entrypoint deliberately does not claim durable WebSocket or cross-invocation Socket.IO support.
- CRDT backlog admission is intentionally process-local. The per-process limits prevent one API
  instance from retaining an unbounded queue, but they do not enforce one cluster-wide total; a
  horizontally scaled deployment that needs a global adaptive budget still requires distributed
  admission accounting such as a Redis-backed counter or queue.
- Socket.IO lock fanout is ordered and revision-fenced but not a durable transactional outbox. A
  process failure after the PostgreSQL commit can therefore delay another browser's cosmetic lock
  update until its bounded lease expires, a conflict ACK supplies the authoritative newer lock, or
  the next JOIN snapshot repairs state. Editing authority remains in PostgreSQL; a future durable
  broker/outbox is the slice required for immediate, lossless post-commit fanout.

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
- A fail-closed committed-suffix planner, exact scene/viewport authority key and two-phase raster
  handoff are mounted behind the paired experiment token. The tile presenter prepares a hidden
  verified frame; one React commit then reveals it and hides only the exact redundant Konva source
  IDs. Scroll/resize, scene edits, selection, drawing tools, post-processing, export, device loss,
  stale frames and replay conflicts immediately restore the vectors.
- The causal/legacy split, not live/committed, decides dab-versus-segment geometry. Causal pen and
  fineliner strokes (`sampleSpacing` or a `pressureModel` set -- the default for every newly
  authored stroke) share the same dab geometry across the live draft compositor, Konva's committed
  render, and the committed WebGPU handoff, all calling `selectStudioCausalInkSamples`/
  `planStudioGpuDabs`. Only legacy strokes (neither field set) still render through Konva's
  endpoint-width segment path (`drawFreehandPenSegments`), which the GPU compositor does not
  reproduce; `studioWebGpuCommittedBarrierReason`'s `requireCausalGeometry` option fails those
  closed for committed handoff. Therefore live-draft ownership remains temporary; browser
  golden-pixel parity for the causal path (in progress, see below) and, separately, an analytic
  segment renderer for the legacy path (optional -- see the capability table below) are what
  broader committed vector authority actually needs.
- Studio live drafts disable unused frame-readback snapshots, eliminating the per-frame full-surface
  texture copy. Empty/invalid stroke sets suspend retained resources and defer GPU initialization
  while keeping an already acquired device reusable for the next valid stroke.

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
- Device loss destroys every readback snapshot owned by the lost device, including an unpublished
  presentation snapshot retained only by a hung `onSubmittedWorkDone()` flight. The recovered
  device therefore receives the full copy-on-write snapshot budget; a late completion is fenced
  and snapshot destruction remains idempotent.
- Explicit engine disposal applies the same device-owned snapshot sweep before destroying the
  device, so closing the editor during a hung queue flight cannot retain unpublished texture
  ownership in JavaScript bookkeeping.
- Canvas2D remains the compositor-compatible fallback when WebGPU is unavailable. Konva remains the
  scene/interactions authority for unsupported images, text, bubbles, filters, selections, and 3D
  surfaces until their render contracts move to GPU passes.
- Broader committed ownership is **not** one bundled prerequisite list to execute because it exists.
  Independently reviewed (2026-07-19, Codex gpt-5.6-sol/max), the four capabilities below solve
  different problems for different product goals and are not one natural dependency chain. Treat
  each as its own driver-gated tier; do not start a tier without its stated driver.

  | Capability | Required when | Status |
  |---|---|---|
  | Causal dab golden-pixel parity | Maintaining the live GPU renderer; piloting causal committed ownership | In progress: `pnpm verify:studio-gpu-committed-parity` characterizes opaque, translucent, and isolated-dab cases against real WebGPU. Remaining diff is native circle-AA-curve disagreement only (no structural bug); not yet gated to a tolerance. |
  | True causal single-point committed eligibility | A production causal committed handoff is actually being enabled | Deferred. Small, well-understood change (loosen `finitePointArray`'s four-coordinate minimum for `requireCausalGeometry` callers only) but production-facing; do not bundle into harness-only work. |
  | Legacy analytic/quadratic segment renderer | GPU must own old (pre-causal) strokes, and the causal-only barrier measurably defeats the benefit | Do not start. Materially harder than "one shader feature": reproducing Canvas2D's smoothed points, per-path `beginPath()`/`stroke()`, straight-line/quadratic branching, endpoint-indexed widths, and round caps/joins is close to a second browser-rasterizer clone. |
  | GPU-aware mixed readback composition | Export, capture, or another feature needs the exact mixed authoritative GPU/Konva frame | Do not start. `captureFrame()` exists and is well-built, but has no non-test/script caller; the mounted `StudioWebGpuCanvas` explicitly disables retained snapshots to avoid an unconsumed per-frame texture copy. |
  | Shared top interaction overlay plane | GPU/raster presentation must cover or replace Konva's interaction layer broadly | Do not start. An end-state migration (selection handles, brush cursors, rulers, perspective controls, pointer capture, touch/pinch, a11y), not an incremental step. The raster pilot deliberately stays idle/select-only for this reason. |

  `createStudioWebGpuCommittedHandoff` currently has no production caller anywhere in `StudioPage`
  (the declarative WebGPU stroke list and committed authority snapshot are both intentionally kept
  empty). Building further prerequisite systems before a committed consumer exists would be
  speculative platform work. Restart only on a concrete, measurable trigger:

  - A representative committed-vector document exceeds its rendering frame budget and profiling
    attributes the cost to Konva committed ink specifically.
  - The eligible frontmost causal suffix covers enough real scenes that moving it to GPU would
    materially reduce Stage work.
  - A new effect or export format requires GPU-owned committed pixels.
  - Export, capture, or raster publication genuinely requires the rendered GPU result.
  - The product deliberately decides to replace the Stage interaction layer.

  If a trigger fires, start with a 1-2 day measurement/acceptance spike (define the desired
  outcome, profile representative documents, measure how often the frontmost-suffix barrier
  actually admits useful ownership, decide whether legacy support is needed at all) before any
  further shader or engine change -- not a resumption of shader tuning for its own sake. Further
  antialiasing-curve tuning on the shared dab shader is a production change to the already-live
  live-ink renderer, not test-only work; it should be driven by a visible defect or a concrete
  ownership requirement, not by chasing a diagnostic counter toward zero.

  Raster-CRDT promotion mirrors the same causal-only geometry policy (`planStudioRasterDrawPromotion`
  in `studio-crdt-raster-ui-bridge.ts` passes `requireCausalGeometry: true`). Legacy strokes therefore
  remain on the Konva segment renderer instead of entering the dab-based raster approximation. The
  raster promotion experiment is still a separate release decision with its own token, independent
  of broader committed WebGPU ownership.

## Verification contracts

- PostgreSQL adapter: query-authority rejection against node-postgres parsing, LISTEN/table preflight,
  max-two-pool listener failure recovery, pending-init cancellation, namespace resubscription,
  credential redaction, fixed transport identifiers, and close ordering run without a DB. CI always
  supplies `STUDIO_LIVE_POSTGRES_INTEGRATION_URL`, applies migration 0009, and gates on two-node
  broadcast/attachment/discovery/server-RPC behavior against its direct PostgreSQL service.
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

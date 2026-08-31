# Studio live canvas gesture architecture

Status: implemented vertical slice for single `DrawEl` resize/rotation; common lifecycle ready for
drawing and multi-selection adapters.

## Decision

Canvas gestures use one renderer-neutral lifecycle:

1. acquire a document lease and capture immutable source identity;
2. offer absolute transient frames through a latest-frame mailbox;
3. present at most one newest frame per animation frame;
4. close renderer claims before the sole durable commit;
5. settle any retained terminal preview after commit acceptance or rejection, while keeping the
   writer lease until authoritative source pixels have acknowledged the terminal handoff;
6. release every claim on Escape, pointer cancel, blur, hidden document, source/selection change,
   disable, unmount, preview failure, or commit failure.

Pointer movement never writes scene state, history, autosave, or CRDT state. Pointer-up is the only
durable boundary and calls the existing document commit exactly once.

The common Interface lives in `studio-live-canvas-gesture.ts`. It intentionally knows nothing about
Konva, React, brushes, document storage, history, or collaboration. A future CanvasKit/Vello/WebGPU
adapter can implement the same transient Interface without changing the caller or commit port.

## Transform presentation strategy

One presentation technique cannot be both fast and correct for every stroke, so single-draw
transforms use a capability- and cost-selected hierarchy. A renderer being safe to execute as an
isolated exact draft is not evidence that its already-rendered subtree is affine-equivalent.

| Frame | Presentation | Cost | Correctness basis |
| --- | --- | ---: | --- |
| Renderer-certified matrix-equivalent frame | retained affine on an isolated lifted wrapper | O(1) scene writes plus isolated Layer paint | renderer-owned signature/capability must prove equivalence |
| Exact-safe and under the renderer work budget | isolated model draft | O(points + one stroke render) per displayed frame | same `planStudioDrawObjectTransform` and `StudioDrawNode` as pointer-up |
| Exact-safe but over budget | source remains authoritative; release-only | O(1) during drag | prevents an unbounded rAF long task and never substitutes a visibly different approximation |
| Malformed transient frame | hold the last valid presentation | O(1) | transient Konva boxes can recover on the next event |
| Valid but uncommittable or renderer-ineligible frame | neutral, commit-at-release fallback | O(1) | never freeze ink at a pose the handles have left |

`push()` only replaces a mailbox and schedules at most one callback. Classification, model planning,
React publication, Konva writes, and clip calculation happen in that callback, never in the pointer
event itself.

The current admitted engines (`causal-ink`, `calligraphy-segments`, `perfect-outline`) all contain
absolute-pixel spacing, quantization, radius or topology rules. The compiler therefore marks all of
them `model-draft-only`; the retained affine tier is structurally available for a future renderer
that supplies positive equivalence evidence and passes the same isolated-Layer lift, but it is not
currently used by the shipped allowlist.

Exact admission is O(1) per frame over gesture-start complexity facts. A separate O(1)
`array.length`/engine/scene preflight runs before the compiler, so a release-only 100k-sample stroke
is not first cloned, stringified, or path-scanned at `transformstart`. Each accepted sample channel
is bounded before the immutable snapshot is built. The page lease uses element identity plus a
monotonic document-generation/mutation ticket instead of serializing the whole Draw payload.

Causal work uses a conservative `sampleCount + ceil(pathLength / 0.5)` dab upper bound: even a
sub-0.5px non-empty segment emits one dab. Its coverage budget uses the alias-resolved renderer
diameter, maximum pressure radius, target scale, Stage scale and canvas DPR, so a Retina/backing-pixel
fill cannot hide behind a small document-pixel estimate. Calligraphy and perfect-freehand admission
also charges the renderer-expanded worst case, rather than trusting source sample count: at most
2,048 path commands, 8,194 serialized coordinate scalars and four million backing pixels per
presented frame. The pinned planners expose O(1) structural bounds (`208S - 2` calligraphy outline
scalars / `108S + 2` worst-run Canvas commands, and `28 * max(N, 5) + 42` perfect-freehand outline
points). This currently admits the tested 19-sample calligraphy and 71-sample perfect boundaries,
while the next samples fail closed before planning. The generic lane charges both a rotated paint
AABB and a zoom/DPR-scaled path sweep. Every future retained route passes the same common budget
before clip scans, and clip work is capped by scene element count. Admission also charges the full
current Layer `SceneCanvas.getWidth() * getHeight()` backing store, because Konva's synchronous
`drawScene()` clears that entire physical-pixel surface even when the selected object's AABB is
small. Missing or non-finite canvas ownership fails closed. Calligraphy bounds distinguish the
single-point pressure-scaled dot from a multi-point nib, and perfect-freehand bounds include the 3px
compact-dot/fallback floor without changing the real planner size. These ceilings are safety limits,
not document limits and must not be raised without p95 browser evidence.

## Exact model-draft surface

The exact fallback does not update the document `elements` array. It publishes one transformed
`DrawEl` to `studio-live-transform-draft-store.ts`, an external store owned locally by the Stage
host. Only `StudioLiveTransformDraftNode` subscribes, so React replans one stroke instead of the
whole document tree.

The draft root is always mounted as the first child of the existing
`studio-single-object-drag-layer`. This is load-bearing:

- it allocates no additional full-DPR canvas;
- the root is pixel-empty outside an exact transform;
- imperative lift appends the source wrapper, proxy, and Transformer after it;
- the exact draft therefore remains below handles without mounting a new root above them mid-drag;
- main document Layer repaint remains limited to gesture begin and finish.

Transform drafts use settled geometry, but `renderPurpose="transform-draft"` suppresses
document-owned diagnostics, committed coverage cache keys, living-ink background bake requests,
and GPU bristle requests. The preview copy also sets `exposeSceneIdentity={false}`, so wrapper
lookup, drag mirrors, cached-duplicate checks, and late selection chrome cannot mistake it for the
authoritative element.

Draft publication crosses a synchronous renderer barrier before source visibility changes and then
draws the Layer that actually owns the source. Every live route requires the isolated drag-Layer
lift; a failed lift is release-only because a retained attr write would still repaint the unbounded
document SceneCanvas. On the reverse transition the source attrs/visibility are restored and its
current Layer receives a synchronous pixel receipt first; the exact React child is then removed and
the isolated Layer is drawn again. When both live in one Layer, the intermediate draw is
unobservable inside the same JavaScript turn. With exact work bounded before this barrier, one
browser paint cannot see a blank source/draft pair or both authorities at once.

## Ownership and terminal handoff

Every model-draft claim has a monotonically increasing generation plus an explicit page/master
scope. An old rAF callback, cleanup, authoritative receipt, or page teardown may not present, clear,
or settle a newer gesture's draft or a draft from another surface.

On a valid pointer-up, the renderer synchronously builds the exact terminal candidate before it
releases the lifted nodes. It then keeps that candidate visible while the document commit runs.
After commit acceptance, the store enters `handoff` and waits for the Stage host to render an exact
model receipt. The authoritative wrapper remains hidden until that receipt; a layout effect then
clears the draft and restores the wrapper before paint. This prevents a one-frame jump back to the
source pose and prevents a duplicate source-plus-draft frame. Handoff registration is pending, not
settled: the common lifecycle retains the page/local/CRDT writer lease until source restoration and
the exact claim generation both acknowledge release. Failed source raster receipts remain retryable.

Commit rejection or throw first synchronously paints the restored source, then clears the candidate.
A bounded timeout performs the same source-first transfer if an interrupted/unmounted React render
never acknowledges the receipt.

## Invariants

- Source bounds and admitted array-valued input channels become bounded immutable gesture-start
  snapshots. Element identity plus monotonic document/mutation generations guard the page lease;
  no unbounded payload serialization runs at begin. Every frame is absolute; deltas never accumulate.
- `offer` is transient-only. `commit` is the sole scene/history/CRDT writer.
- Resolution seals a session before callbacks, so synchronous `transformend` or re-entrant cancel
  cannot resolve it twice.
- Proxy restoration, renderer cleanup, Layer restore, clip restore, wrapper neutralization, chrome
  restore, and lease release are independently attempted. Layer setup rollback and final cleanup use
  the same phase-aware recovery record, including hosts that mutate move/position/z and then throw.
  A failed `close`/`settle` retains renderer ownership and retries with bounded exponential backoff;
  the page lease is not released and body drag is writer-gated until close-critical ownership is
  actually restored. Structural ownership errors remain distinct from Transformer/canvas
  presentation errors.
- Live retained and exact drafts are available only after the existing drag-Layer composition/lift
  preflight succeeds. Cached, clipped, masked, backdrop-sensitive, stacking-sensitive, or otherwise
  non-liftable strokes remain release-only; no live route repaints the document Layer per frame.
- An exact lift is refused when any ordinary visible authored paint leaf exists above the selected
  wrapper. The preflight descends Konva containers, so a mounted shell whose parked children are
  all hidden does not block the lift; a visible or cached paint subtree still fails closed. Moving
  the draft to a later Layer would otherwise invert occlusion until pointer-up.
- Panel clip membership is recomputed from transformed points with the same geometry the commit
  reads, and travels atomically with the exact draft snapshot.
- No preview subtree exposes the authoritative `studioElementId`.
- A retained terminal draft disappears only on authoritative receipt, rollback, superseding
  generation, or safety timeout.

## Current capability boundary

The shipped vertical slice covers one selected `DrawEl` whose renderer, complexity, and composition
preflights are positively allowed. Current admitted ink renderers use the exact model-draft path for
uniform, non-uniform, and rotated frames; an over-budget stroke keeps the release-only path rather
than blocking the UI. Resize and rotation still bake into points in one existing document commit,
so undo, autosave, and CRDT semantics do not fork.

The isolated exact path also requires the selected wrapper to be topmost among authored painting
siblings. Cached/clipped/masked/backdrop-sensitive strokes and strokes with effective per-sample
calligraphy orientation remain release-only. The orientation scan runs only after the calligraphy
compiler preflight has capped it at 256 samples; ordinary Stage React renders never scan tilt/twist
arrays for every stroke.

This does not yet make every multi-selection live. The current group planner deliberately preserves
many stroke/effect radii while a root Konva scale enlarges them, so applying one affine to arbitrary
draw/text/frame/image mixtures would lie about pointer-up. Multi-selection must either render a
planner-produced ephemeral scene or stay commit-at-release.

The current draw model also stores one scalar `strokeWidth`. Under a non-uniform transform the
commit uses the geometric mean of X/Y scale; the exact draft matches that product rule. A truly
anisotropic nib would require a separate model/CRDT/export/render-schema decision and is not implied
by this gesture architecture.

## Long-term decision and migration roadmap

The durable end state is a first-class, renderer-neutral object transform matrix on scene nodes.
Pointer-up should commit that matrix in O(1), making the retained gesture matrix and the saved
document mean exactly the same thing even for a 100,000-sample stroke. Baking points/width becomes
an explicit `Flatten/Reshape` operation executed off the interaction path.

The visual contract is `T(Render(raw geometry))`, not `Render(T(raw geometry))`. That distinction
is observable for symmetry, bounds-derived primitives, textured/noisy brushes, calligraphy nibs,
paper grain and raster-backed surfaces. A durable renderer should therefore keep an outer wrapper
at the element's stable z/composite/clip slot and put paint plus its hit shape under one inner
content-transform group. A transform-only commit must preserve the raw render-payload identity so
`StudioDrawNode` does not rerun an O(points) brush planner just because the matrix changed.

This cannot be introduced as a DrawEl-only optional field in one patch. Today the CRDT draw bridge
drops unknown transform state, older peers can overwrite it, and bounds, hit testing, node editing,
masking, raster promotion, alternate renderers and SVG/PSD/WILL export read raw points directly.
Shipping the writer before every reader would make collaborators and exporters see different
artwork. Migration must therefore be reader-first:

1. define and validate a versioned finite/invertible `Mat2d` scene-node contract;
2. teach project load, CRDT payloads, mixed-version negotiation and recovery to preserve it;
3. centralize transformed bounds, hit testing, clipping and render projection;
4. make every export/alternate-render surface either consume the matrix or explicitly flatten it;
5. fail closed or flatten before point-editing tools that are not yet transform-aware;
6. only then switch pointer-up from point baking to an O(1) matrix commit and add an explicit
   background/worker flatten command.

The smallest safe first writer is deliberately narrower than the final matrix type: one `DrawEl`,
translation/rotation/positive uniform scale, finite invertible orientation-preserving similarity,
and no shear, reflection or non-uniform scale. Its gesture composes in document space as
`Tnew = Ggesture · Told`. Before that writer can turn on, the project/autosave format needs a
minimum-reader version (the current repository implies project v3), the typed CRDT stroke payload
and room protocol need coordinated version gates (the current next versions are stroke v5 and room
v7), and old peers must be unable to join a transform-bearing room while silently ignoring the
field. Node edit, vector erase, boolean operations, mixed/group resize, frame reflow, InkML/WILL,
and alternate renderers must either consume the matrix or expose an explicit unavailable reason.
No command may keep running against raw points as if they were still world coordinates.

Until those reader gates are complete, exact-under-budget plus release-only is intentional. A
retained approximation followed by an exact pointer-up swap would reintroduce the visible snap this
work is meant to remove.

### 1. Progressive long-stroke presentation

Move exact geometry and raster planning to a generation-tagged Worker/OffscreenCanvas or GPU
ephemeral surface. Only the newest completed generation may present. A deadline miss keeps a stable
proxy for the rest of that gesture (hysteresis), rather than oscillating between modes. The
main-thread React tree should receive an `ImageBitmap`/surface receipt, not rebuild a huge stroke
subtree every frame.

### 2. Multi-selection

Add a `group-uniform` renderer adapter behind the same transient Interface. It must preflight the
whole selection and present all-or-none. A retained-affine slice may admit only model types whose
planner semantics are matrix-equivalent; the general solution is an isolated ephemeral scene
produced by `planStudioGroupUniformResize`. Selection UI must pass document facts and node resolution
only—eligibility, caches, clips, masks, and renderer ownership remain inside the adapter.

### 3. Drawing gestures

Wrap the existing live drawing rAF pumps in the common begin/offer/finish/cancel lifecycle. Drawing
keeps its specialized incremental renderers, but lease/cancel/late-frame/history rules become the
same as transforms. A drawing terminal frame still seals through its existing one-shot commit.

### 4. Renderer replacement

Keep geometry planning and the common lifecycle in-process and renderer-free. Konva remains one
local-substitutable adapter. CanvasKit/Vello/WebGPU adapters may consume the same absolute frame and
either apply a retained matrix or render an ephemeral scene-IR candidate. Unsupported capabilities
must neutralize and retain the release-only commit path, never silently approximate.

### 5. Strict whole-document pixel parity

The current exact lift refuses any later visible painting sibling, preserving correctness at the
cost of live eligibility. A less conservative implementation needs an overlap gate that includes
shadows/filters/clips, an in-place draft slot, or prefix/candidate/suffix render surfaces. A durable
scene-node matrix naturally keeps the original z slot and is the preferred end state.

## Release gates

- Unit: lifecycle exactly-once behavior, all cancel reasons, setup/cleanup failures, generation
  isolation, commit rejection/throw, and terminal handoff timeout.
- Planner: non-uniform width/points parity, route thresholds, coordinate/width rejection, rotation,
  arrow and companion geometry.
- Renderer: affine/model mode switching, clip switching, source visibility, Layer ordering,
  identity isolation, late callback invalidation, cancel and commit receipt.
- Browser: trusted handle drag while pointer is held, transient motion before mouseup, durable and
  history state unchanged mid-gesture, one history entry on release, Escape rollback before late
  mouseup, and complete neutral attrs afterward. Evidence must sample the native Konva SceneCanvas
  backing pixels (not an exported/offscreen rerender), prove the source footprint was replaced, and
  match proxy translation plus width/height ratios during the held top-left resize.
- Performance: 100+ input events coalesce to one latest presentation per frame; document Layer
  draws only at begin/finish; one-stroke draft memory stays bounded; geometry/planning CPU targets
  6-8ms and presented-frame p95 targets 16.7ms on the 60Hz tier (33ms fallback tier). Ratchets cover
  2k/10k/50k samples, causal/perfect/calligraphy, dropped frames, document-Layer draw count and GC
  spikes. The current main-thread exact lane is admitted conservatively until those browser
  ratchets and the progressive worker/GPU lane exist.

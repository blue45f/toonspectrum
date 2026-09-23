# ADR-0025: Skia retained GPU document display migration

Status: **implemented retained-display and exact-export migration with explicit compatibility boundaries; not a whole-editor cutover**.
Date: 2026-09-22, final software closure updated 2026-09-23. Yjs remains canonical; Automerge is admitted only as an optional offline proposal journal.

## Decision

The admitted ordinary-ink and vector document display slot moves from the previous idle Vello surface to a persistent CanvasKit 0.41.1 WebGL2 surface. The existing HTML canvas remains the output element; the new module does not execute CanvasRenderingContext2D painting or per-frame CPU pixel readback. Vello remains an explicit comparison/provider, not an automatic replacement after a failure.

Immutable per-element SkPictures preserve the existing causal dab/pressure/paint contracts. Unchanged geometry is not compiled again. Composite pictures are retained in batches of at most 128 items; append rebuilds only its changed batch, not a document-wide composite. Snapshot keys keep revision tokens rather than retaining old source item graphs. An append-only change under the same camera paints only the added items onto the preserved GPU framebuffer. An unchanged frame does not rasterize again. A bounded GPU-only viewport snapshot cache accelerates recent visual restores; it is not a second Undo or document authority. Camera/clip changes re-present the source pictures under the same document-coordinate transform.

## Authority and lifecycle

- Existing document, Yjs, Undo, original strokes, asset references and SQLite/OPFS storage remain unchanged.
- An authorized local draft may display while optional CRDT startup is pending. Joined/saved work still consumes the existing document-lock projection. This display admission grants no edit, lease, ACK or save permission.
- Imperative Stage camera changes use a scoped event adapter, coalesce into one animation frame and read the actual current transform, including scrolled viewport offsets.
- The owning Stage hides its document pixels only for an exact matching source-revision receipt. The GPU canvas is revealed only after the hidden-source layer paint has actually completed, not merely after a React opacity update.
- A committed stroke normally keeps its settled live pixels until the exact Skia scene is both rendered and actually visible. That receipt retires the FIFO without a redundant visible Konva document draw. Unsupported, stale or failed Skia admission remains fail-visible and falls back to the existing synchronous Konva draw receipt.
- The first source-paint fence may be skipped only when the current queue head, page, project generation and every committed stroke ID are covered by retained settled ink and the requested Skia projection. The hidden-source fence still runs before the GPU canvas is revealed, preventing double compositing.
- One surface owns the admitted document pixels. Specialised brush previews and input/selection still use their existing owners.
- Ephemeral committed-ink authority, visible-presentation receipts and bounded defer counters live in a dedicated host runtime hook. The editor host only queues source surfaces and executes the final release/fallback draw; document and permission authority are not duplicated.
- Loading requests retain only the latest pending visual frame and settle superseded requests. No accepted canonical input is dropped.
- Picture cache has a 128MiB admission budget. Viewport snapshot cache keeps at most three images and 32MiB logical pixel storage, with a 16MiB per-image limit. The GPU cache limit is requested at 64MiB; driver-reported usage may be unavailable and is reported as null, not zero.
- Every path, recorder, picture, snapshot, surface and GL context is released explicitly. Device loss invalidates pending publication and rejects late or mismatched revision receipts. Device loss latches unavailable and offers explicit recovery of the same engine. No software-surface fallback or engine substitution occurs inside this renderer.

## Coverage and remaining migration

Supported first: versioned ordinary pen/marker, finalized direct eraser, the previously admitted exact vector/path subset, static colour-only frames, and a strict subset of static raster images. Frame theme paint preserves the established border, dash, clipped shadow and child panel clipping. A frame with image background, non-identity opacity or unsupported colour remains on the compatibility boundary. Transparent frame paint can still own the existing child clip.

Static PNG/JPEG images are decoded under bounded byte/pixel budgets and retained as CanvasKit GPU textures. The admitted subset preserves rotation, X/Y flip, opacity, supported blend modes, bounded skew, rounded clipping and one bounded drop shadow. Filtered, filter-masked, layer-masked, animated-GIF/current-frame and multi-frame image semantics are flattened only through the established final-pixel worker/mask authority into a bounded, ref-counted specialist raster lease; the source document and original asset remain unchanged. Adjustment-layer/page-composite semantics, alpha-lock/clip-below semantics or unsupported blend behavior stay on the compatibility boundary instead of being approximated. Admission, decode, timeout or texture-budget failure returns an `unsupported` receipt and preserves the original asset.

Horizontal LTR text with one solid style now uses CanvasKit paragraph shaping and an exact declared font source. Pretendard and approved Google/preset font stylesheets are allowlisted; custom fonts come from the existing bounded product repository. Font bytes, provider lifetime, unresolved glyphs and preparation time are bounded. Vertical text, ruby, range-local formatting, gradients, strokes, shadows, paths, skew and strong RTL text stay on the compatibility renderer until their direction and shaping contracts are explicit.

The compatibility shadow and GPU projector build one visible-frame resolver per render projection instead of scanning every unrelated element for every child. When an exact GPU receipt owns the document pixels, the heavyweight Konva document paint tree is unmounted rather than merely opacity-hidden. A single hit-only proxy uses a retained spatial index and exact stroke/rotated-box checks; unchanged geometry does not rebuild the index. Selecting content remounts the established compatibility edit nodes.

An admitted exact single-draw selection remains on the retained Skia surface. During scale or rotation, the retained projection removes that source once while the established isolated Konva exact-draft lane owns only the moving object and transform chrome. Further pointer frames update the draft without new GPU document submissions. Pointer-up retains the source-hidden GPU receipt until the committed authoritative revision reintroduces exactly that source and a visible Skia receipt acknowledges the handoff. Unsupported selections, grouped or multi-selection, active eraser interactions and other non-admitted gestures retain their explicit compatibility owners.

Complex filters and masks, browser-owned animation frames and settled natural-media final pixels enter Skia only through the specialist final-pixel boundary. Supported export pages render on a detached exact-revision Skia surface. Gradients, paper grain, page timelines, colour-proof projection, unsupported document elements or over-budget backing stores explicitly retain the canonical compatibility export. Physical pen and 30/120-minute real-device certification remain operational acceptance gates rather than silently claimed software coverage.

This changes the actual mounted document surface, not merely a renderer label or an installed dependency. It does **not** mean the entire editor no longer uses Konva/Canvas2D. Primary-role documentation distinguishes the bounded display island from overall document/input/brush authorities.

# Skia GPU document migration acceptance — 2026-09-22

Status: implemented bounded migration; not a complete editor-engine replacement.

## Continuation and scope

The interrupted `feat/skia-primary-renderer-20260922` work was recovered, including its original stroke planner, persistent WebGL2 renderer, receipt-gated Stage handoff, and in-progress camera adapter. Concurrent changes in that worktree were preserved. An independent snapshot is validated on `fix/skia-gpu-acceptance-20260922`; no original worktree or unrelated process is overwritten. The additional hidden-source paint fence and backing-generation guard from PR #1949 are integrated; this branch is a follow-up to that PR, not a third competing full-engine merge.

Automerge is deferred. Yjs, immutable source strokes, editor commands, Undo and SQLite/OPFS remain authoritative. CanvasKit 0.41.1 uses WebGL2 for this surface; this is not a completed WebGPU conversion.

## Implementation

- Retained element SkPictures and 128-item composite batches. Append recompiles one affected batch and paints the new item rather than re-recording a document-wide picture. Metadata comparisons still scale with the document; this is not an O(1) whole-editor claim.
- Explicit GPU/resource cleanup, at most three/32MiB logical viewport snapshots, 128MiB picture admission and a requested 64MiB GPU resource-cache limit. Actual driver memory can be unknown; these are not a measured total-process peak.
- Both the completed source paint and the subsequent hidden-source paint are acknowledged before exposing GPU pixels; the parent opacity change alone is not considered proof that old pixels are gone.
- Exact requested-revision validation and cancellation of pending publication on device loss. A stale success cannot re-enable a lost surface.
- Snapshot descriptors retain stable revision tokens instead of entire historical source objects. Resizing clears incompatible snapshots and invalidates an externally resized backing buffer.
- Scoped imperative camera events read the actual Stage transform, including viewport scroll offsets, and coalesce into one animation frame.
- A local draft already admitted by the existing document-lock projection may display before optional remote synchronization is ready. Remote/joined hydration and existing asset/preview gates remain intact. No mutation/lease/server-save permission is created.
- Canonical pen/marker/eraser source and paint semantics are preserved. Visible unsupported content is not omitted or approximated to pass the GPU gate.

## Verified behavior

After integrating PR #1949, the focused suite passed 16 files / 130 tests and the real product three-stroke/zoom/rotation/Undo scenario passed again. Exact remote CI and build results are recorded on the follow-up PR head.

- Unit coverage includes retained batches, changed-item compilation, bounded image lifetime, dispose, loading failure, superseded requests, exact source receipts, camera subscriptions and missing/remote/local frontier distinctions.
- Actual Chromium 151 (ANGLE Metal / Apple M2 Max) and Firefox 153 renderer tests exercise 3,000/10,000 strokes, 100 append/undo cycles, independent GPU contexts, DPR resize, rotation/reflection, and real context loss followed by explicit same-engine recovery.
- The 10,000-stroke renderer sequence retained 5,130,876 bytes of picture records. One measured 100-cycle run reported append CPU-submission P95 3.8ms in Chromium and 6ms in Firefox. These are not pointer-to-photon, complete document commit, driver memory, or physical pen measurements. Other verification processes were active on the same Mac.
- The real `/studio/canvas` UI test creates three ordinary pointer strokes, switches to one visible Skia surface, operates zoom/90-degree rotation and follows existing Undo/Redo. It uses no fabricated source revision, permission override, API authentication stub, or engine-name-only assertion.

## Reproduction

```sh
pnpm exec vite --host 127.0.0.1 --port 5278 --strictPort
# Independent renderer fixture and real product route; a normal Chromium binary is required.
node scripts/verify-studio-skia-document-engine.mjs http://127.0.0.1:5278 chromium,firefox
node scripts/verify-studio-skia-product.mjs http://127.0.0.1:5278
node scripts/verify-studio-skia-multitab-mobile.mjs http://127.0.0.1:5278
pnpm run typecheck
pnpm run build:bundle && pnpm run check:studio-bundle
```

The product runner can also target a loopback server serving the built `dist/`.
Screenshots and JSON reports are generated under `artifacts/skia-document/` and `artifacts/skia-product/`, not committed source.

## Limits and negative evidence

The default Chromium headless-shell was observed using SwiftShader, not physical GPU hardware. Its dense camera-repeat attempt exceeded the bounded run; it is not counted as a hardware performance success. The runner now uses the documented regular Chromium channel and records the actual driver instead of assuming GPU acceleration from the API name. Firefox may mask its GPU name.

Current canonical input, committed-stroke fences, transform editing, text shaping, animated/filtered/masked images, natural-media providers and exports still retain existing compatibility boundaries. A change to unsupported content may leave this bounded display slice. Exact static PNG/JPEG display is now admitted under bounded decode/texture budgets, and GPU ownership unmounts the heavyweight Konva document paint tree while a hit-only proxy preserves first selection. Full removal of Konva/Canvas2D, 30/120-minute physical-device operation, complete original-file/export parity, and end-to-end pointer-to-photon latency remain separate acceptance gates. No tests, image thresholds, CI protections or bundle ratchets were relaxed. No production deployment was performed.

## Main integration continuation — 2026-09-22

The user requested completion of this in-progress GPU change and a main merge, not an operational deployment.
The existing acceptance worktree and PR #1951 are the integration owner. #1949 is already an ancestor;
#1950 was compared file by file rather than merged over newer publication and backing-store fixes.

The unique terminal-resource cleanup from #1950 is integrated: GPU loss schedules native resource
release after the drawing stack unwinds, and a failed frame releases pictures, snapshots, surface and
context immediately. The failure remains latched until explicit same-engine recreation. Cleanup is
idempotent with later unmount/dispose and cannot be prevented by a throwing observer.

Three new regressions were first run against the previous source: all three failed; the prior 12 passed.
After the cleanup integration, all 15 renderer tests passed. Expanded package, registry, React surface,
frontier, canvas and access-policy tests: **445 passed, 4 existing capability-dependent skips**.

The unchanged Chromium/Firefox hardware suite passed all **16 scenario groups**, including 10,000
short strokes and 100 append/undo cycles. The real editor verifier now includes GPU loss, recovery UI,
explicit retry and exact recovered GPU pixel comparison, in addition to drawing/zoom/rotation/Undo.
All **4 real-editor scenario groups** passed on Chromium/ANGLE Metal Apple M2 Max without API or ACL mocks.

Production rebuild and exact-head remote core/verify results are recorded in the PR after completion.
These results do not certify full Konva/Canvas2D removal, physical pen latency, total GPU memory or
30/120-minute soak. The dedicated broader Full Test Diagnostic is distinct from core/verify; earlier
run 35656230252 reported 9 failures in 6 unrelated unchanged test files, not a green full repository suite.
No tests, budgets, authorization, persistence, Automerge, deployment or branch protection were weakened.

## Static panel continuation — 2026-09-22

This continuation keeps Yjs, commands, Undo and persistence unchanged while widening only the exact GPU display boundary. Static colour-only frames now retain the existing classic/soft/vivid border defaults, inset border, dash, clipped vivid shadow and child panel clipping. Frame image backgrounds, non-identity frame opacity and unsupported colours remain on the compatibility boundary.

The frame theme participates in the exact scene revision and in retained picture invalidation. Transparent frame paint may still provide the authoritative child clip. Hidden frames do not clip. Child clipping continues to use the existing axis-aligned smallest-containing-frame rule; polygon geometry remains the frame's own paint/clip shape and is not silently substituted for that established child policy.
The compatibility document layer and GPU projector each build one frame-only resolver per immutable projection rather than rescanning all unrelated elements for every child. The resolver has regression coverage against the established `containingPanel` policy.

Focused tests currently cover frame admission, transparent clips, theme invalidation, retained panel changes and renderer validation. Chromium 151 on ANGLE Metal / Apple M2 Max and Firefox 153 passed the existing 3,000/10,000-stroke, append/undo, resize, camera and context-loss scenarios plus static panel pixel comparison. The panel comparison reported alpha ratio 1.0241, edge mismatch 0.0365 and premultiplied colour error below 2.74 in both browsers. These tolerances compare two antialiased renderers; they are not permission to omit panel pixels.

The real `/studio/canvas` verifier also passed the existing draw, zoom/rotation, Undo/Redo and explicit same-engine loss recovery journey after this continuation. Static images, text shaping, masks, filters, natural media and exports remain separately gated and are not counted as completed by this evidence.

Final local verification for this continuation used the exact branch source and the built production `dist`. The focused panel/projector/surface/wiring suite passed 6 files / 63 tests. The complete `studio-engine-skia`, Creator render and canvas test scope passed 229 files / 2,543 tests after materializing four tracked sparse-checkout WebP fixtures from their unchanged `origin/main` blobs. Web/API typecheck, architecture boundaries, changed-file secrets and lint, production build, generated notices, CSP and the existing Studio bundle ratchet passed without budget changes.

The final direct GPU run passed 18 scenario groups across Chromium 151 on ANGLE Metal / Apple M2 Max and Firefox 153. It retained 10,000 strokes through 100 append/Undo cycles, preserved bounded picture bytes, and passed static panel pixel comparison in both browsers. The built production preview passed the real `/studio/canvas` four-part journey: draw, zoom/rotation, Undo/Redo, GPU loss and explicit same-engine exact-pixel recovery. Test-only harness HTML is a Vite development fixture and is not claimed as a production route.

## Static image, paint-tree and soak continuation — 2026-09-22

The exact display boundary now admits unfiltered, unmasked, non-animated static PNG/JPEG images. Encoded input is bounded at 32 MiB and decoded images at 8192 per dimension / 16 Mi pixels. Per-context GPU image residency is bounded at 64 MiB. Rotation, X/Y flip and opacity are retained as GPU draw metadata. Image decode/admission failure produces an explicit `unsupported` receipt so the product keeps the compatibility renderer; it does not latch the Skia renderer as failed.

GPU-owned documents no longer keep the full Konva document paint graph mounted at opacity zero. The graph is unmounted after the exact Skia presentation fence, while a lightweight hit-only proxy preserves first-selection behavior. Selecting an object returns the page to the existing compatibility editing graph, so transform and interaction authority remain unchanged.

Final focused image/panel/surface checks passed, and the complete `studio-engine-skia` + Creator render/canvas test scope passed **232 files / 2,552 tests**. Changed-file lint, Web/API typecheck, architecture boundaries, production build, postbuild/CSP/legal generation and the existing Studio bundle ratchet all passed without budget changes.

The direct hardware browser run passed **20 scenario groups** across Chromium 151 (ANGLE Metal / Apple M2 Max) and Firefox 153. In both browsers it covered pen/marker/eraser parity, static panel clipping, static PNG rotation/flip/opacity, independent contexts, DPR resize, 3,000/10,000 retained strokes, camera reuse, real context loss and 100 append/Undo cycles. At 10,000 strokes the 100-cycle append P95 was about 4.2 ms in Chromium and 6 ms in Firefox in the final image-enabled run; these remain CPU submission measurements rather than pointer-to-photon latency.

The real `/studio/canvas` verifier passed five checks: draw activation, Konva paint-tree unmount with hit-proxy selection restoration, zoom/90-degree rotation without geometry recompilation, authoritative Undo/Redo, and explicit same-engine recovery with exact pixels after real GPU context loss.

A synthetic long-session soak started from 10,000 retained strokes and completed **5,000 append/Undo cycles** on Chromium/ANGLE Metal. Picture records stayed fixed at 5,130,876 bytes, retained viewport snapshots stayed within 3,686,400 bytes, submission P95/P99 were about 3.6/4.1 ms, worst observed submission was 9 ms, and forced-GC JS heap delta was about +1.05 MiB. This is useful stability evidence but is not a substitute for 30/120-minute physical pen, OS memory-pressure or battery/thermal certification.

Automerge remains deferred. Yjs, source document/Undo, SQLite/OPFS, authorization, persistence and export authority are unchanged. No production deployment was performed.

## Settled live-ink handoff continuation — 2026-09-23

Committed ordinary strokes now carry the document project-generation number in the exact Skia scene revision. The handoff coordinator accepts a Skia receipt only when page, generation and every stroke ID match and the GPU canvas has actually become visible. A merely `active` authority is not sufficient: while the hidden-source fence is pending, the settled live overlay remains fail-visible.

When retained settled ink covers the exact queue head, the first visible Konva source-paint fence is skipped. After CanvasKit presents, the compatibility document tree is hidden and painted clear; only then is the GPU canvas revealed and the visible receipt emitted. Unsupported, stale, timed-out or unavailable Skia admission keeps the established synchronous Konva draw fallback. If Skia already owns the document but is not yet visible, fallback is deliberately held because its Konva paint tree is no longer mounted.

The focused bridge, surface, coordinator and source-boundary suite passed 5 files / 63 tests. The complete `studio-engine-skia` + Creator render/canvas scope passed **234 files / 2,583 tests** after materializing tracked sparse-checkout fixtures from unchanged `origin/main` blobs. Full Web/API typecheck, changed-file lint, architecture boundaries, production build, postbuild/CSP/legal generation and the existing Studio bundle ratchet passed without budget changes.

The real `/studio/canvas` Chromium run on ANGLE Metal / Apple M2 Max confirmed `data-studio-skia-source-fence="settled-ink"` for three pointer strokes, followed by exact GPU visibility, selection compatibility restoration, zoom/90-degree rotation, Undo/Redo and explicit same-engine recovery after real context loss.

This does not move document authority, Undo, Yjs, SQLite/OPFS, permission checks or export. Automerge remains deferred and no production deployment was performed.

## Host runtime, multitab and mobile-emulation continuation — 2026-09-23

The editor host no longer owns separate Skia authority, visible-receipt and defer-attempt refs. A dedicated `useStudioSkiaCommittedInkHostRuntime` wraps the existing fail-closed runtime; the host only queues committed surfaces and performs the final release or compatibility draw. The one-shot self-modifying CI repair job and its branch-specific patch script were removed after the product source adopted the boundary directly. `StudioCuttoonEditorHost.tsx` is back within the 29,696-line architecture ratchet.

Focused bridge, surface, integration and architecture tests passed **4 files / 49 tests**. The final broad `studio-engine-skia` + Creator render/canvas scope passed **234 files / 2,574 tests**. Changed-file lint, Web/API typecheck, the ToonStudio CI execution contract, architecture/app-boundary validation, production build, postbuild/CSP/legal generation and the existing Studio bundle ratchet all passed without changing budgets. Yjs, document/Undo, SQLite/OPFS, authorization, export and Automerge policy remain unchanged.

The clean-server real `/studio/canvas` run confirmed the settled-ink source fence, exact GPU visibility, hit-proxy selection restoration, zoom/90-degree rotation without geometry recompilation, authoritative Undo/Redo and explicit same-engine exact-pixel recovery after a real context loss.

A same-browser two-tab Chromium run gave each editor its own visible Skia surface. A real context loss in tab A showed only tab A's recovery state; tab B retained byte-identical pixels, and tab A recovered through the existing explicit same-engine action. A separate **390×844**, 2× DPR, touch-enabled iPhone-UA emulation drew two strokes and published exactly one bounded Skia document surface. This is browser-layout and GPU-isolation evidence, not physical iOS/Android pen, thermal, battery or OS memory-pressure certification. No production deployment was performed.

The acceptance runner opens and publishes tab A before creating tab B, and explicitly foregrounds the page whose GPU state is being exercised. This prevents a background-tab scheduling timeout from being mistaken for a renderer failure. The mobile path dispatches Chromium `touchStart`, `touchMove` and `touchEnd` input rather than mouse events. The isolated production-preview rerun completed both checks in about 14 seconds with zero page errors on ANGLE Metal / Apple M2 Max.

## Exact selection and transform-preview continuation — 2026-09-23

One selected ordinary draw no longer revokes exact Skia document ownership. The existing hit-only Konva proxy remains the selection and gesture entry point while the heavyweight document paint tree stays unmounted. Marquee selection, non-draw selection and unsupported draw families still fail closed to the compatibility path.

An admitted scale/rotate gesture now projects the claimed source out of the retained Skia document exactly once. The established isolated Konva exact-draft lane owns the moving source and transform chrome. Its subsequent pointer frames keep one stable projection token and do not submit new GPU document frames. At pointer-up, the old source-hidden GPU receipt remains visible until the committed document revision semantically matches the terminal draft, the source is reintroduced, and a visible Skia receipt acknowledges the handoff. Document, Undo, Yjs, permissions and persistence remain authoritative and unchanged.

The transform continuation was rebased over the retained-camera translation work. Camera translation, non-translation camera changes, active source exclusion and terminal handoff are covered together by the focused suite: **6 files / 90 tests** passed, including an actual Konva hit-proxy source claim. The direct hardware browser verifier passed **22 scenario checks** across Chromium 151 on ANGLE Metal / Apple M2 Max and Firefox 153. In both browsers the first transform frame reduced the retained source set from 80 to 79, two later pointer frames submitted no GPU document work, and the terminal handoff restored 80 items while compiling only the changed source.

The real `/studio/canvas` verifier was updated to require that an exact single-draw selection keeps the Skia surface active and the Konva paint tree unmounted. That runner could not be completed in this isolated worktree because the local Nest API requires a `DATABASE_URL` not present in the available local environment; it stopped before editor mount rather than bypassing API, authorization or persistence. This is recorded as environment-limited negative evidence, not a product success. No test threshold, bundle budget, permission check or fallback policy was weakened. Automerge and production deployment remain deferred.

## Text, rich static-image and spatial-hit continuation — 2026-09-23

The retained surface now admits horizontal LTR solid text when one exact font source can shape every glyph. Pretendard, approved Google/preset CSS and the existing custom-font repository retain bounded source identities. Font CSS, font bytes, provider memory and preparation time are bounded; unresolved glyphs, strong RTL content and advanced typography remain on the compatibility renderer. A stalled font loader therefore cannot hold the latest-frame queue indefinitely.

Static PNG/JPEG items retain the already bounded texture path and now preserve the admitted blend mode, bounded skew, rounded clip and one drop shadow. Invalid source metadata, animation, unsupported effects or admission failure return an explicit unsupported receipt rather than changing source data or latching an engine failure.

The one-node hit proxy now keeps a retained RBush index with exact freehand-segment and rotated-box checks. Identical 10,000-element projections perform no index mutation; small edits use remove/upsert operations, while larger changes rebuild deterministically. The source document, z-order, selection command, transform editor and permission authority are unchanged.

The direct Chromium 151 / Firefox 153 WebGL2 run passed Korean Pretendard shaping, image and panel comparison, DPR resize, camera reuse, real context loss and explicit same-engine recovery, plus 3,000/10,000 retained strokes and 100 append/Undo cycles. Canvas text antialiasing is not treated as byte-identical to CanvasKit: admission is based on preserved glyph coverage, layout geometry and declared typography; unsupported typography remains fail-visible on the compatibility path. This evidence does not replace physical pen, thermal, battery, OS memory-pressure or export certification.

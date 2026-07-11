# Studio commercial suite — mobile verification captures

Captured on 2026-07-11 from the local Vite production-equivalent UI at a 375 × 812 CSS-pixel viewport.
These are implementation evidence, not product mockups.

| Capture | Verified flow |
| --- | --- |
| `writer-room-mobile.png` | Seven-stage story planning, AI draft review, and canvas projection readiness |
| `ai-provenance-mobile.png` | Provider/model/result provenance without raw prompts or credentials |
| `publish-package-mobile.png` | Publish preflight and deterministic single-ZIP package workflow |
| `auto-actions-mobile.png` | Typed batch actions, page scope, dry run, automatic recovery point, and one-step undo |
| `bubble-library-mobile.png` | Two-column vector preview gallery for eleven emotion and narrative bubble variants |
| `bubble-tail-editor-mobile.png` | Speaker side, attachment edge, position, length, base width, and bend controls |
| `asset-actions-mobile.png` | Always-discoverable 44px rename, share, and delete actions for saved assets |
| `raster-props-mobile.png` | Reviewed transparent café, school, fantasy, and urban foreground prop catalog |
| `asset-favorites-mobile.png` | Persistent raster favorite, favorite-only intersection, and independent insert action |
| `quick-actions-mobile-default.png` | Six-direction thumb menu with disabled-state feedback and drag-to-execute hub |
| `quick-actions-mobile-customize.png` | Per-direction assignment sheet exposing all twelve quick actions |
| `dialogue-read-aloud-mobile.png` | Browser-native dialogue proofing queue, voice/rate controls, and row-level playback |
| `review-pdf-profiles-mobile.png` | Internal-only review PDF profile selection with explicit private-metadata boundary |

For each screen the interactive controls were checked at the mobile viewport, horizontal document
overflow was zero, and critical touch controls were at least 44 CSS pixels tall. The archive and publish
flows were also exercised through real browser downloads; their binary ZIP integrity is covered by the
corresponding automated tests.

Additional measured checks for this batch:

- Bubble gallery cards measured 168 × 99 CSS pixels at 375px viewport width.
- Every segmented bubble-tail button measured exactly 44 CSS pixels tall; the range rows provide a
  44px label hit area around the native slider.
- Saved-asset actions measured 44px tall and the preview insertion target measured 80px tall.
- Raster prop cards measured 167 × 160 CSS pixels and inserted a self-contained WebP data URL with a
  stable catalog ID plus publish-preflight AI provenance.
- Raster favorite buttons measured 44 × 44 CSS pixels and the favorite-only filter measured
  81.875 × 44 pixels. The saved-asset favorite-only control measured 167.5 × 44 pixels.
- Reloading the Studio restored the guest-scoped favorite ID; favorite-only left exactly the selected
  café prop visible without triggering canvas insertion.
- All five screens from the speech-bubble, asset, and favorite batches retained zero horizontal
  document overflow.
- Quick Action slots measured 84 × 64px and the drag hub 64 × 64px. All six slots stayed inside the
  viewport with zero horizontal overflow at 360 × 640, 375 × 812, and 430 × 932. A real pointer-capture
  drag to the south slot activated the pen exactly once; a dead-zone press executed nothing and kept
  the menu open. A live viewport resize kept the portalled menu open and re-clamped every slot; a
  synthetic orientation change closed it. Enter on the focused hub moved focus to the first enabled
  menu item. A customized north slot survived reload through the versioned preference store.
- All six Quick Action assignment selects measured 299 × 44px at 375px width. The completion action is
  sticky, so the sheet remains finishable while its direction rows scroll on short phones.
- The mobile dialogue panel measured 359 × 632px at 375 × 812 and ended immediately above the 112px
  studio dock. Play, pause/resume, stop, rate, voice, and row speaker targets measured at least 44px;
  live browser playback, pause, resume, stop, confirmed device-local Korean voice fallback, and zero
  horizontal overflow were exercised. Remote or unknown voices now require explicit OS-service consent.
  React StrictMode effect replay was also covered so development cleanup cannot permanently disable the
  speech controller.
- The internal review PDF profile select measured 325 × 44px and its privacy boundary notice exactly
  44px tall at 375 × 812. Selecting the full production profile kept document overflow at zero and made
  the page/review/panel/dialogue scope visible without exposing the profile in the public manifest.

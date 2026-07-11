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

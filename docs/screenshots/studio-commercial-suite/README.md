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
| `advanced-fill-mobile.png` | Browser-local Advanced Fill controls for scope, tolerance, expansion, and gap closing |
| `advanced-fill-reference-mobile.png` | Separate line-art reference plus transparent color-layer preview with explicit apply/undo boundary |
| `inspector-navigation-mobile.png` | Sticky four-tab mobile inspector with a short empty state and one-tap layer access |
| `inspector-layer-actions-mobile.png` | 44px layer visibility and compact mobile action disclosure for lock, order, and delete |
| `inspector-navigation-desktop.png` | Viewport-bounded desktop inspector aligned with the canvas workspace height |
| `project-actions-mobile.png` | Two-column mobile project menu replacing the long horizontal project-action strip |
| `project-actions-tablet.png` | Viewport-fixed three-column project menu at 768px, proving the scroll-header clipping boundary |
| `project-actions-desktop.png` | Compact desktop project bar with backup, planning, review, and publish tools in one popover |

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
- Advanced Fill retained zero document and panel overflow at 360 × 640, 375 × 812, and 430 × 932.
  At 375px, its primary button, color row, scope select, sliders, disclosure, reset, and reference action
  all measured 297 × 44px or larger; checkbox rows measured 297 × 52–53px. A transparent two-cell PNG
  was filled directly on the main canvas, accumulated across two taps, previewed without a history write,
  applied as one undo step, undone/redone, and cancelled with Escape. A second transparent color layer
  used a separately flagged line-art layer as its composite boundary, while a fully transparent current
  layer was stopped by the 65% leak guard with no preview or apply action. A 3,840 × 2,160 source also
  completed its leak-guard analysis while the UI stayed responsive; both the panel and canvas status bar
  expose a 44px calculation-cancel action. Pointer-up tap recognition ignored a >8px canvas drag without
  starting a fill, preserving one-finger long-canvas pan and two-finger pinch intent. Console warnings/errors
  were zero.
- The workspace inspector retained zero horizontal overflow at 360 × 640, 375 × 812, 430 × 932,
  1366 × 768, and 1440 × 900. Its four primary mobile tabs and close action measured 44px high;
  the 360px layout kept four equal 75.49px-wide tabs and the 430px layout kept four equal 92.94px-wide
  tabs. The desktop inspector uses the same `100dvh - 21rem` maximum height as the canvas viewport
  (432px at 1366 × 768 and 564px at 1440 × 900) with `overflow-y: auto`, `overscroll-contain`, and a
  sticky navigator instead of extending the Studio document.
- The inspector's local, context-aware search reduced `미니맵` to one result and Enter moved directly to
  `페이지 › 미니맵`. ArrowRight moved the selected primary tab from `페이지` to `게시`, while Home/End
  and the reverse direction share the same roving-tab implementation. Consumed tab keys stop before the
  canvas-wide shortcut handler, and the handler also rejects `defaultPrevented` events so a selected drawing
  cannot be nudged by panel navigation. Escape and result activation return focus to the persistent search
  toggle instead of leaving focus on an unmounted input. Search result counts are announced through a polite
  live region, and Korean IME composition is ignored until composition completes.
- Mobile layer rows expose only a 44 × 44px visibility action and a 44 × 44px more action alongside the
  layer name. Expanding more revealed 44px lock, order, alpha/reference when applicable, and delete
  actions without widening the document; desktop retains the compact direct-action row.
- The top project bar now keeps only download, project, draft save, and publish visible. Fourteen less
  frequent backup, restore, planning, review, production, and publish-package actions live in one bounded
  project popover. At 375 × 812 every project action measured 167.5 × 44px, the menu measured 359 ×
  418.6px, horizontal overflow remained zero, and opening Version closed the popover before presenting
  its panel. The popover stays viewport-fixed through the tablet breakpoint so a horizontally scrolling
  header cannot clip it; archive/file workflows remain open while busy or reporting diagnostics and expose
  an explicit 44px close action. JSON, archive, and PSD file pickers use keyboard-focusable buttons rather
  than unfocusable label-only triggers. At 768 × 1024 the fixed menu measured 752 × 329px, remained wholly
  inside the viewport, and document horizontal overflow was zero. The only browser console errors were the
  expected 502 responses from the intentionally absent local API proxy; no client runtime warning/error was emitted.

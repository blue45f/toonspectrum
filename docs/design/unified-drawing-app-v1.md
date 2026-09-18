# Unified ToonStudio Draw v1

## Product rule

**One editor runtime, one document model, one save pipeline.**

ToonStudio Draw is not a second editor and `drawingShell=app` is not a capability mode.
The same canonical Studio document route is rendered with one of two presentations:

- `integrated`: normal ToonStudio production chrome.
- `app`: canvas-first drawing chrome for an installed PWA or an in-site pure drawing session.

Changing presentation must never copy, migrate, down-convert or fork the current project.
Brushes, layers, selection, transforms, history, import/export, autosave, collaboration and
recovery keep the exact same runtime owners.

`/offline-draw/` is a separate emergency-resilience surface only. It must not be marketed as
ToonStudio Draw or used as the implementation behind the product install button.

## Benchmark principles

### Clip Studio Paint

Applied principles:

- Keep a professional Studio mode with command bar, dockable palettes and quick access.
- Treat workspace layout as presentation state rather than document capability.
- Put the active drawing tool, main/sub color concepts, brush size and tool properties close
  to the canvas.
- Make frequently used commands reachable through Quick Access and shortcuts instead of
  adding permanent chrome for every command.
- Let users move between a focused/simple presentation and the full Studio without creating
  another document model.

### Krita

Applied principles:

- Canvas-only is a first-class working state, not a special document type.
- Artists should be able to hide chrome instantly and recover it without disturbing artwork.
- Palette/dock arrangement belongs to workspace preference state.

### Procreate

Applied principles:

- Prioritize the canvas and reduce visual chrome in the drawing presentation.
- Preserve direct access to brush, color, size/opacity, undo/redo and a customizable quick
  command surface.
- Prefer touch/stylus gestures that do not interfere with pinch/rotate navigation.

## v1 implementation

### Shared presentation state

`studio-drawing-presentation.ts` owns only the `integrated | app` presentation projection.
An explicit `drawingShell` query wins and is remembered for the current tab/PWA session so
canonical Studio navigation does not unexpectedly reintroduce site chrome.

The helper preserves unrelated query state (workspace, room, language, version, focus, etc.).
The app presentation adds `uiMode=focus&startTool=draw` as launch hints only.

### Drawing app chrome

`StudioDrawingAppBar` projects existing Studio state and handlers:

- current brush and direct brush-library entry;
- brush size, opacity and stabilizer state;
- current color and color wheel;
- undo/redo;
- existing Quick Access palette;
- page and layer/property panels;
- canvas-only mode;
- explicit return to full Studio.

No drawing operation is implemented inside the app bar.

### Installed PWA

`/draw-app/manifest.webmanifest` has a distinct app identity but starts
`/studio?drawingShell=app&uiMode=focus&startTool=draw` and uses the root Studio scope/service
worker. The install page must never register the `/offline-draw/` worker.

This gives an app-window identity while preserving normal project routing and storage.

### Emergency recovery boundary

`/offline-draw/` remains a small server-independent editor with its own bounded cache and local
recovery format. It is allowed to have fewer capabilities because it is a last-resort resilience
surface, not a presentation of the product editor.

## UX acceptance gates

1. Opening the same document in `integrated` and `app` presents the same artwork, layer state,
   brush state, history and save target.
2. Switching presentation never changes document/project IDs.
3. A command available in the Draw app must call the normal Studio handler; no duplicate draw
   command implementation is allowed.
4. Brush library, color wheel, Quick Access, page/layer panels and canvas-only remain reachable
   from drawing-app chrome.
5. Installed PWA start URL resolves to the normal Studio router.
6. Emergency drawing manifest/install assets must not be present.
7. Existing keyboard/stylus/touch behavior remains available; presentation-specific shortcuts
   may only be additive and must not steal pinch/rotate or active pointer ownership.
8. Desktop and tablet layouts must keep at least 44px practical touch targets where touch input
   is expected and must respect safe-area insets.

## Next engine-quality work

The shared runtime is already the only place to improve drawing quality. Follow-up work should
therefore land in common Studio modules, never under `/draw-app/`:

- brush latency/prediction and coalesced-event profiling;
- pressure/tilt curve calibration and device presets;
- stabilizer modes and long-stroke endpoint quality;
- brush-engine preview parity with committed strokes;
- large-canvas tile/memory pressure tests;
- layer compositing/blend correctness and clipping/mask acceptance;
- selection/transform edge quality;
- PSD round-trip fidelity and recovery tests;
- pen-display and tablet gesture acceptance runs.

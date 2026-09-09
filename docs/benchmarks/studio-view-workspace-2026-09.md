# Studio View Workspace benchmark and implementation

- Date: 2026-09-09
- Scope: `/studio` canvas View controls
- Branch: `feat/studio-view-workspace-pro-20260909`
- Principle: View operations must stay non-destructive. They must not enter document history, CRDT state, exports, or persistence.

## Existing baseline

The Studio already provided a strong rendering baseline before this change:

- pointer-centred zoom gestures and bounded zoom steps;
- fit-to-width and actual-pixel views;
- non-destructive horizontal mirror and quarter-turn rotation;
- mini-map navigation, canvas-only mode, fullscreen, guides, grid, rulers, grayscale proofing, and perspective helpers;
- session-only capture/restore of a page view;
- selection framing through the existing `zoomToSelection` controller.

The main usability gap was not missing rendering primitives. It was that precise navigation was fragmented across menus, a status rail, and gesture-only paths. The compact tool HUD exposed only zoom step buttons, fit width, actual pixels, 90-degree rotation, mirror, and reset.

## Competitive benchmark

| Product | Relevant View workflow | Studio decision |
| --- | --- | --- |
| Adobe Photoshop | Navigator percentage field, zoom slider, zoom buttons, 100% and fit commands, proxy navigation, temporary bird’s-eye view, and non-destructive numeric canvas rotation | Add exact percentage entry, a continuous slider, common zoom presets, and retain non-destructive view semantics |
| Clip Studio Paint | Zoom presets, Navigator controls, display reset, rotation controls, and horizontal/vertical canvas flip | Keep the proven quarter-turn/horizontal mirror pipeline; make current rotation and zoom much more legible |
| Krita | Canvas-only/fullscreen modes, detached canvas, mirror view, rulers/guides/grid, and status-bar zoom/rotation controls | Retain existing canvas-only/fullscreen/guides stack; consolidate the precision controls into the active View HUD |
| Figma | Zoom menu, zoom-to-selection, rulers/guides, pixel-grid options, and quick preset navigation | Promote the existing selection-framing controller into the zoom HUD and preserve disabled-state guidance when nothing is selected |
| Procreate | Direct canvas gestures, reference companion, canvas flip/rotate, and low-friction reset | Preserve gesture-first operation while providing an equally capable keyboard/mouse fallback |
| Storyboard Pro | Navigation-oriented View menu, camera/light-table workflows, and multiple context views | Keep secondary/reference view and multi-view work as a separate renderer project rather than mixing it into this low-risk HUD change |

Primary references:

- https://helpx.adobe.com/photoshop/using/viewing-images.html
- https://helpx.adobe.com/photoshop/using/rotate-view-tool.html
- https://help.clip-studio.com/en-us/manual_en/270_canvas/Navigating_the_canvas.htm
- https://docs.krita.org/en/reference_manual/main_menu/view_menu.html
- https://help.figma.com/hc/en-us/articles/360040449873-Adjust-your-zoom-and-view-options
- https://help.procreate.com/procreate/handbook/interface-gestures/gestures
- https://docs.toonboom.com/help/storyboard-pro-24/storyboard/reference/menu/view-menu.html

## Implemented

### Precision zoom workspace

- Exact percentage entry accepts `125`, `125%`, and locale-friendly decimal comma input such as `62,5`.
- Invalid input reverts to the current value instead of issuing a malformed state transition.
- Exact requests are converted from effective document magnification to the engine’s existing user-zoom multiplier.
- The current fit scale is respected, so entering `100%` means effective 1:1 magnification rather than blindly assigning a user multiplier of `1`.
- Existing engine limits (`0.2×` to `5×` user zoom) remain authoritative.
- A logarithmic slider gives useful control at both low and high magnifications.
- 25%, 50%, 100%, 200%, and 400% presets are exposed; out-of-range presets remain visible but explainably unavailable.

### Selection framing

- The already-tested `zoomToSelection` controller is exposed in the zoom HUD.
- The action is disabled, not hidden, when there is no selection, retaining discoverability and a clear reason.
- Selection framing continues to use the existing viewport controller and therefore does not mutate document data.

### Rotation and state clarity

- The rotation HUD now gives the current quarter-turn angle a dedicated live status between the left/right controls.
- Horizontal mirror, reset, fit width, and actual pixels remain available in the same non-destructive workspace.

### Accessibility and interaction

- Existing roving-toolbar keyboard navigation is preserved for buttons.
- The percentage editor handles Enter locally and Escape as “revert this edit”; Escape on toolbar actions still closes the HUD and restores focus to its invoking control.
- Slider, input, presets, state, disabled reasons, and selection framing have explicit accessible labels.
- Touch-sized primary actions and horizontal overflow remain intact for narrow screens.

## Safety boundaries and deferred work

Arbitrary-angle rotation, vertical mirror, detached/reference canvases, and multiple named view slots were intentionally not forced into this change. The current quarter-turn/horizontal-mirror model is shared by comment coordinates, mini-map projection, WebGPU overlays, retained media, live collaboration cursors, and capture/export paths. Expanding that matrix safely requires an explicit transform contract and cross-renderer test plan.

The new workspace only adapts existing view state. It does not alter page elements, revision history, collaborative document state, saved work records, or database schemas. No Neon migration is required.

## Verification targets

- pure precision math: base-scale derivation, engine-bound clamping, logarithmic slider round trips, and locale-friendly parsing;
- component behavior: exact entry, presets, invalid-entry recovery, unavailable actions, selection framing, keyboard roving, local/global Escape behavior, mirror state, and rotation status;
- integration: View HUD receives the current effective scale, derived limits, selection count, and existing selection-framing handler from the canvas viewport.

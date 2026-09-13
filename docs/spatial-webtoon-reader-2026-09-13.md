# Spatial webtoon reader — 2026-09-13

## Implemented scope
Read-only image reader launched from the existing published-work reader (inside its mature-content gate) and Studio's spatial storyboard panel. It does not replace the canonical BG3D renderer, alter source pages, capture saved 3D shots automatically, or store device/room poses.

Focus, three-window arc and wall layouts; overlapping long-page reading windows; canonical LTR/RTL navigation; source-page/window sliders; theme, scale, distance and texture quality controls; browser-local preferences and bounded published-work progress. Local image files remain in the browser and their names/positions are not persisted.

XR is progressively enhanced. The Three.js runtime loads only when the browser exposes secure WebXR. Mode requests occur in the explicit click turn through the existing Studio session authority. AR hit testing is optional and falls back to view-relative positioning. World-space controls remain usable without DOM overlays; transient-pointer select events use their own source, not a fixed input-array index. Head-direction dwell is opt-in, not eye tracking. There is no forced camera travel or automatic reading motion.

## Benchmarks and primary references
- ShapesXR frames: manual storyboard/frame navigation and controller-driven step-through. https://learn.shapesxr.com/basics/scenes
- ShapesXR presentation: desktop and immersive paths rather than headset-only access. https://www.shapesxr.com/product/present
- Apple/WebKit natural WebXR input: transient inputs exist only during gestures; selection must use the event's source. https://webkit.org/blog/15162/introducing-natural-input-for-webxr-in-apple-vision-pro/
- W3C DOM Overlays: prevent duplicate spatial selects only over interactive DOM controls. https://immersive-web.github.io/dom-overlays/
- Immersive Web hit-test specification: optional environmental placement with browser-owned tracking. https://immersive-web.github.io/hit-test/

These are interaction/architecture references, not claims of feature parity, device certification, shared anchors, eye-tracking access, or licensed asset reuse.

## Resource and privacy boundaries
At most three source images retained by the XR pool, 1K/1.5K/2K bounded textures, static non-XR presentation, paused hidden XR interaction, bounded image loading timeout, stale-generation guards, disposal after native session release, and canceled late hit-test subscriptions. Inputs are raster-only; URL schemes and credentials are validated. Existing CORS policy is not bypassed. Source-image decoding can still be memory intensive, so local file and decoded-dimension limits apply.

## Verification
- `pnpm exec vitest run apps/web/src/domains/creator/spatial` plus the existing session, published-reader and spatial-storyboard tests: 121 tests passing before integration.
- `node scripts/verify-spatial-reader-browser.mjs`: real Chromium desktop/mobile smoke test; writes screenshots to a temporary directory, then removes its temporary HTML entry. Does not emulate or certify headset hardware.
- Push must retain the repository architecture, frontend/API typecheck and changed-file lint hooks.
- Physical AR/VR headset testing remains required for tracking, comfort, device-specific input and compositor behavior. Mock session integration tests do not replace that check.

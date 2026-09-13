# Comic video director

The existing `/create/promo` and `/showcase/promo` editor now supports a browser-local motion-comic workflow. No paid API, hosted rendering service, new application dependency, database migration, or artwork upload is introduced. Existing text-AI story planning remains explicit and optional.

## Workflow

1. Upload PNG/JPEG/WebP artwork. Long vertical manuscripts can be split into 2/3/4/6/12 equal-height images **before** downscaling; this is not automatic panel detection. Files sort naturally by filename. Review speech balloons at split boundaries.
2. Apply one of six editable local templates: anime opening, cinematic trailer, romance teaser, mystery teaser, launch short, or story recap. Original panel order and nonempty captions are preserved. Duration weights use a deterministic text-length heuristic, not inference.
3. Refine each shot: 11 camera motions, four transitions, rain/snow/embers/speed-line overlays, intensity, and crop focal point. Upload a separately prepared transparent foreground for genuine two-layer parallax. The editor does not infer depth or remove backgrounds.
4. Style captions (classic/boxed/typewriter, top/center/bottom), ending branding, and portrait-safe margins. Platform interfaces vary: check the destination platform before publishing. Low-motion mode disables camera motion, particle overlays, animated transitions and typewriter reveal.
5. Add an audio file or generate an original local synthesized pad (ambient/pulse/suspense). A separate uploaded narration track has independent volume and start time. It plays once, ends at the video boundary and ducks the BGM while active. No voice cloning or TTS service is called.
6. Export a native 720/1080-short-side browser video, portable Remotion render kit, project JSON, SRT, WebVTT, generic frame-based shot-list JSON, first-shot poster or storyboard contact sheet. WebM is finalized with duration and keyframe cues without transcoding. Browser-supported MIME determines the native extension; WebM is never renamed MP4. The optional Remotion kit retains its separate license notice.

The existing bounds remain: 12 shots, 15/30/60 seconds including a two-second ending, and 9:16/16:9/1:1. Native recording is real-time: keep the tab visible. The frame-accurate optional local Remotion composition can render H.264 independently of wall-clock browser playback.

## Reliability and privacy

- The declared 30fps recording now requests 30fps rather than the previous 5fps capture rate. Real-time recording can still drop frames under machine load; the frame renderer itself is deterministic.
- 30-step undo/redo shares immutable media strings rather than copying raw image buffers on each edit.
- IndexedDB stores one local draft with debounced writes and explicit restore/save/error status. A transactional revision check prevents another open tab silently overwriting a newer draft. Removing every shot also persists. Keep a project JSON backup: browser storage may be cleared or exhausted.
- Loading and composition/export do not require AI. Browser E2E verifies video export with the network disabled **after the page has loaded**; this does not claim an uncached offline route can be opened from scratch.
- Imported projects reject remote URLs, SVG/script sources, invalid numeric/enumerated settings, duplicate identities, oversized embedded media and malformed voice/presentation settings. Raster decoding is sequential and budgeted. Cancellation, hidden tabs and encoder failures never result in a success download.
- This creates motion-comic animation from supplied artwork. It does not introduce a generative character-acting, lip-sync, interpolation or video-diffusion model.

## Verification

Commands used (the standard repository hooks remain enabled):

```sh
pnpm exec vitest run apps/web/src/domains/creator/promo apps/web/src/domains/creator/animatic/studio-animatic-recorded-webm.test.ts
node tools/verify-studio-promo-recording.mjs
node tools/verify-studio-promo-preview.mjs
python3 tools/verify-studio-promo-output.py --self-test
python3 tools/verify-studio-promo-director-output.py --results test-results --remotion /path/to/director/out/promo.mp4
pnpm exec eslint apps/web/src/domains/creator/promo e2e/studio-promo.spec.ts --max-warnings=0
pnpm exec playwright test --config playwright.promo.config.ts --project=chromium
```

Local verification used an isolated worktree, its own Vite cache/port and installed Chrome. Unit tests: 59 passed. Recorder/preview lifecycle tests: 17 + 5 passed. The two browser scenarios use production UI, real canvas, real local audio and real native encoding; only the optional text-AI HTTP responses are fixtures. They exercise split import, templates, foregrounds, history, narration, captions, exports, local draft restoration, mobile overflow and offline-after-load recording.

The browser-exported enhanced Remotion ZIP was installed separately and actually rendered at quarter scale: H.264, 450 video frames, 30fps, 15-second video track, AAC audio. Native output: 720×1280, VP8/Opus, 30fps. Audio analysis detected the scheduled test narration at 2 seconds and BGM attenuation near 28% in both encoded outputs. Poster output was 1080×1920; the four-scene contact sheet was 720×852. Machine/font/codec differences can affect rendering and encoder padding.

## Recording-quality follow-up (2026-09-13)

The failed hosted video gate produced only 146 native frames in its enhanced
15-second fixture. The 338-frame minimum remains unchanged. This follow-up
addresses product rendering overhead and separates video testing from the 3D
suite's forced SwiftShader flags; it does not waive video or audio checks.

- Bounded text raster tiles avoid repeating text shaping and shadow rendering.
  Per-canvas LRU caches are limited to 16 tiles / 2,000,000 pixels, and are
  released on preview unmount and recording cleanup. Typography is preserved.
- Recording progress updates at most five times per second rather than
  rerendering the editor on every frame. Capture still requests 30fps.
- Music fades and narration ducking use linear ramps scheduled on the Web
  Audio clock. Source nodes stop at the timeline boundary, independent of UI.
- `playwright.promo.config.ts` uses an isolated cache/port and fresh browser,
  without unrelated 3D renderer flags. Both full editor workflows and the new
  raster-quality scenario remain mandatory alongside real encoded-media tests.

Run browser verification with:

```sh
pnpm exec playwright test --config playwright.promo.config.ts --project=chromium
```

Local validation of this follow-up:

- 62 unit tests (project/model/director/audio automation/shared WebM finalizer).
- 19 recording-lifecycle and 5 preview-lifecycle regression tests.
- Two full browser workflows passed. A third real browser test compares
  cached versus uncached text in 45 combinations of ratio, style, frame and
  nonsequential seek, and checks 150 edits, bounded cache size and cleanup.
- Actual native output: basic 443 frames, director 452 frames (including the
  final capture flush), VP8/Opus, finalized duration 15 seconds. These are
  local measurements, not an exact frame-count guarantee on every device.
- Both newly exported Remotion kits were installed and rendered independently.
  Enhanced H.264/AAC output: exactly 450 video frames at 30fps / 15 seconds.
- Encoded-audio analysis verified narration at 2 seconds and BGM attenuation
  ratios of 0.295 (native) / 0.296 (Remotion). The basic output also passed
  audio/video timing and visible title/CTA ending-card validation.

No new application dependency, hosted renderer, paid API, database operation,
neural character animation, voice cloning or artwork upload is introduced.
Repository CI and production deployment status must be checked separately
from these local measurements.

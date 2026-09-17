# Offline drawing, real inference and spatial reading

## User entry points

- `/offline-draw/`: independent drawing-only editor and Studio emergency fallback,
  with no authentication, API, React bundle, localization fetch or external fonts.
  New drawing, four genuinely different brush mechanisms, pressure-aware pointer
  input, eraser, undo/redo, eight layers, zoom/fit, image import, PNG and editable
  `.toonlocal` export.
- `/offline-draw/install.html`: dedicated install surface for the drawing-only PWA.
  Its manifest uses the distinct `/offline-draw/` app id and scope, so it can coexist
  with the full ToonStudio PWA. Chromium install prompts are captured on this page;
  browsers without that API receive manual Add to Home Screen / app-install guidance.
- `/offline-draw/portable.html`: downloadable single-file version. After it has
  been saved locally, it does not need the origin, a service worker, CDN or API.
  Automatic storage under `file://` varies by browser; the UI never claims it saved
  when storage fails. Editable backups/PNG export remain available.
- `/studio/ai-lab`: authenticated real Wan/TripoSR/SDXL work submission, progress,
  cancellation, integrity-checked downloads and explicit owner cleanup. Engines
  remain unavailable until a protected worker and reviewed models are configured.
- `/spatial-reader/`: local embedded-image chapter authoring and 2D/spatial/AR/VR
  reading, captions, cut sequencing, timed progression, bookmarks, depth layers,
  saved chapters, and portable `.toonspace` export. No images are uploaded.

Existing studio library, readiness card and promo page link to these flows. The
original drawing engine, OPFS project storage and cloud sync are not replaced.
The drawing-only editor is deliberately a separate local editor, not a promise that
all advanced Studio/AI/3D functions work without a server. It also remains the safe
fallback offered when the full Studio shell cannot mount.

## Server outage behavior

The early bootstrap prepares a small validated offline shell independently of the
React application. The existing root worker intercepts only same-origin GETs for
these explicit static assets; it never queues writes or caches private API responses.
For Studio navigation only, network failure, HTTP 5xx or a four-second response
failure selects the prepared local drawing shell. A normal API failure cannot
silently replace an open drawing tab: recovery links open a new tab.

First use still requires successful installation/caching or possession of the
portable HTML file. A browser that has never received the application cannot
magically open it while its origin is unavailable. Clearing browser storage,
private mode or quota pressure can remove automatic saves; keep exported backups.
The drawing shell cache is separate and contains no artwork. Its ready marker is
written only after every required asset has passed HTTP/MIME/size checks.

No worker uses skipWaiting or clients.claim to replace a running editor mid-stroke.
Prepared v1 shell assets remain coherent and sticky: a future code update should use
an explicit new cache/schema version plus user-directed adoption, not overwrite a
running version's dependencies. Do not clear artwork databases during upgrades.

## Local data safety

Drawing data uses `toonstudio-emergency-drawing-v1`, not existing Studio OPFS/SQLite.
Documents plus five revision snapshots commit atomically. Only transaction completion
produces a saved indicator. Optimistic version conflicts create a recovery copy,
never an overwrite. Input validation, raster decoding and dimension limits run before
an imported backup replaces current artwork. Storage failure leaves the drawing in
memory with an explicit unsaved warning and export options.

Spatial chapters use `toonstudio-spatial-reader-v1`. Reopening forks the chapter ID,
so two tabs do not overwrite the same chapter record. The `last` pointer is simply
the last successful save; all chapter records remain selectable. Explicit file exports
are the durable backup. Embedded texture decode failures preserve the current chapter.

## Spatial rendering contract

A single native WebGL owner renders the current cut and its immediate neighbors.
Source images cap at 2048 pixels, GPU uploads at 1024 pixels, up to four depth layers
per cut. Textures outside the three-cut window are released. Desktop renders on
changes instead of running a permanent animation loop. DPR caps at 1.5.

WebXR uses per-eye projection/view matrices and viewport selection. Entry requires
an explicit user gesture; AR optionally uses hit-testing/DOM overlay. Without
hit-testing it can place a chapter in front of the viewer. VR navigation uses
controller ray selection or debounced sticks with no forced camera translation.
Previous/next/exit targets and a flat DOM reader remain available. Automatic cut
progression is opt-in; Escape stops it. AR/VR support still depends on the actual
browser/device and secure context. Real headset/mobile acceptance has not been run.

## Verification commands

```sh
node --test tools/creator-runtime/contracts.test.mjs
node tools/creator-runtime/build-portable.mjs --check
python -m pytest services/creator-inference/test_runtime.py -q
node tools/creator-runtime/compile-worker.mjs
python tools/creator-runtime/offline-browser.py
python tools/creator-runtime/spatial-browser.py
rm -f apps/web/public/__test-sw.js
pnpm typecheck
pnpm build
```

The browser scripts run against their own local HTTP fixture server and the actual
worker source compiled for the test, not rewritten mock routing. They require a
normal Playwright Chromium environment. A browser administratively blocked from
local HTTP navigation cannot exercise these tests. Hardware XR and real inference
are separate acceptance gates. The CPU inference tests use a clearly identified
injected test double; they must never be counted as generation quality tests.

See `services/creator-inference/README.md` for model acquisition, licenses, GPU
qualification, deployment/secret configuration, queue/storage policy and limitations.
Use `gpu-smoke.py --help` only on an authorized, prepared worker; it intentionally
requires `--allow-generation` to run real models and consume GPU resources.

## Release checklist

Pass the branch's contract/API/browser/typecheck/build jobs; review screenshots.
Install and license-review immutable model revisions; run all three real inference
paths and review actual outputs, temporal stability, pose/identity and mesh defects.
Verify AR placement/session exit on Android XR hardware and controller interaction
on a supported headset. Confirm production headers and SW upgrade behavior on the
actual host. Publish retention and model-usage policies before enabling inference.
No paid API/hardware, main merge or production deployment is performed by these files.

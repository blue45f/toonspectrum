# Offline drawing, real inference and spatial reading

## User entry points

- `/draw-app/install.html`: install surface for **ToonStudio Draw**. This is not a
  second editor. Its manifest starts the canonical `/studio` runtime with
  `drawingShell=app&uiMode=focus&startTool=draw`, so installed-app and in-site drawing
  share the same document identity, Studio brush engine, layers, autosave, collaboration,
  import/export and project storage. `drawingShell=app` changes presentation/chrome only.
- `/studio?...&drawingShell=app`: the same Studio editor in canvas-first drawing chrome.
  The app bar projects the current Studio brush, size, opacity, stabilizer and color and
  exposes the existing brush catalogue, color wheel, quick access, page/layer panels and
  canvas-only mode. Touch gestures use the same Studio preferences in both presentations:
  the configured two/three-finger actions remain authoritative, while a four-finger tap adds
  a canvas-only toggle without replacing pinch/rotate navigation.
- `/studio?...&drawingShell=integrated`: return the same document to the normal full
  production Studio. No project conversion, document copy or alternate drawing format is
  involved in switching presentation.
- `/offline-draw/`: independent **emergency recovery editor** only, with no authentication,
  API, React bundle, localization fetch or external fonts. It remains intentionally small:
  new drawing, four brush mechanisms, pressure-aware pointer input, eraser, undo/redo,
  eight layers, zoom/fit, image import, PNG and editable `.toonlocal` export. It is not
  marketed or installed as ToonStudio Draw.
- `/offline-draw/portable.html`: downloadable single-file emergency version. After it has
  been saved locally, it does not need the origin, a service worker, CDN or API.
  Automatic storage under `file://` varies by browser; the UI never claims it saved when
  storage fails. Editable backups/PNG export remain available.
- `/studio/ai-lab`: authenticated real Wan/TripoSR/SDXL work submission, progress,
  cancellation, integrity-checked downloads and explicit owner cleanup. Engines
  remain unavailable until a protected worker and reviewed models are configured.
- `/spatial-reader/`: local embedded-image chapter authoring and 2D/spatial/AR/VR
  reading, captions, cut sequencing, timed progression, bookmarks, depth layers,
  saved chapters, and portable `.toonspace` export. No images are uploaded.

The product drawing experience is therefore **one source/runtime with two presentations**:
normal Studio chrome and drawing-app chrome. The emergency editor is a separate resilience
surface and must never be used as the product implementation or advertised as feature parity
with Studio.

## Server outage behavior

The early bootstrap prepares the small `/offline-draw/` recovery shell independently of the
React application. The existing root worker intercepts only same-origin GETs for explicitly
approved static assets; it never queues writes or caches private API responses. For Studio
navigation only, network failure, HTTP 5xx or a four-second response failure can select the
prepared emergency drawing shell. A normal API failure cannot silently replace an open Studio
drawing tab: recovery links open a new tab.

The installed ToonStudio Draw presentation uses the normal root Studio service worker and normal
Studio storage/runtime. The emergency `/offline-draw/` worker stays scoped to `/offline-draw/` and
is not registered by the product Draw installer. This prevents the resilience editor from becoming
a competing source of document truth.

First use still requires successful installation/caching or possession of the portable HTML file.
A browser that has never received the application cannot magically open it while its origin is
unavailable. Clearing browser storage, private mode or quota pressure can remove emergency-editor
automatic saves; keep exported backups. The emergency cache is separate and contains no artwork.
Its ready marker is written only after every required asset has passed HTTP/MIME/size checks.

No worker uses skipWaiting or clients.claim to replace a running editor mid-stroke. Prepared
emergency shell assets remain coherent and sticky: a future code update should use an explicit
new cache/schema version plus user-directed adoption, not overwrite a running version's
dependencies. Do not clear artwork databases during upgrades.

## Local data safety

The **Studio/ToonStudio Draw** product runtime uses the existing Studio document persistence,
project storage, save pipeline and collaboration rules. Changing `drawingShell` does not migrate
or fork any artwork.

Emergency drawing data uses `toonstudio-emergency-drawing-v1`, not existing Studio OPFS/SQLite.
Documents plus five revision snapshots commit atomically. Only transaction completion produces a
saved indicator. Optimistic version conflicts create a recovery copy, never an overwrite. Input
validation, raster decoding and dimension limits run before an imported backup replaces current
artwork. Storage failure leaves the drawing in memory with an explicit unsaved warning and export
options.

Spatial chapters use `toonstudio-spatial-reader-v1`. Reopening forks the chapter ID, so two tabs
do not overwrite the same chapter record. The `last` pointer is simply the last successful save;
all chapter records remain selectable. Explicit file exports are the durable backup. Embedded
texture decode failures preserve the current chapter.

## Spatial rendering contract

A single native WebGL owner renders the current cut and its immediate neighbors. Source images cap
at 2048 pixels, GPU uploads at 1024 pixels, up to four depth layers per cut. Textures outside the
three-cut window are released. Desktop renders on changes instead of running a permanent animation
loop. DPR caps at 1.5.

WebXR uses per-eye projection/view matrices and viewport selection. Entry requires an explicit
user gesture; AR optionally uses hit-testing/DOM overlay. Without hit-testing it can place a
chapter in front of the viewer. VR navigation uses controller ray selection or debounced sticks
with no forced camera translation. Previous/next/exit targets and a flat DOM reader remain
available. Automatic cut progression is opt-in; Escape stops it. AR/VR support still depends on
the actual browser/device and secure context. Real headset/mobile acceptance has not been run.

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

The browser scripts run against their own local HTTP fixture server and the actual worker source
compiled for the test, not rewritten mock routing. They require a normal Playwright Chromium
environment. A browser administratively blocked from local HTTP navigation cannot exercise these
tests. Hardware XR and real inference are separate acceptance gates. The CPU inference tests use
a clearly identified injected test double; they must never be counted as generation quality tests.

See `services/creator-inference/README.md` for model acquisition, licenses, GPU qualification,
deployment/secret configuration, queue/storage policy and limitations. Use `gpu-smoke.py --help`
only on an authorized, prepared worker; it intentionally requires `--allow-generation` to run
real models and consume GPU resources.

## Release checklist

Pass the branch's contract/API/browser/typecheck/build jobs; review screenshots. Install and
license-review immutable model revisions; run all three real inference paths and review actual
outputs, temporal stability, pose/identity and mesh defects. Verify AR placement/session exit on
Android XR hardware and controller interaction on a supported headset. Confirm production headers
and SW upgrade behavior on the actual host. Publish retention and model-usage policies before
enabling inference. No paid API/hardware, main merge or production deployment is performed by
these files.

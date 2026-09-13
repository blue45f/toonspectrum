# Local-first drawing, generative workflows, spatial reader

Implementation branch: `feat/local-first-inference-spatial-20260913` · PR #1373.

## Release status

This is an implementation and verification candidate, not a declaration of production readiness. The authoring container passed 68 deterministic contract checks using pure functions and explicit HTTP/ledger/IndexedDB protocol doubles, including 13 TypeScript transpile syntax checks. These are not full TypeScript types or browser/GPU/PostgreSQL/XR tests. Browser navigation was denied by the execution environment's administrator policy; the remote development terminal later stopped responding. No successful browser run, GPU inference, migration, deployment or main merge is claimed.

## User entry points

- `/offline-drawing.html`: independent basic editor, no login/API/React/model/CDN dependency.
- `/studio/generate`: actual native ComfyUI inference jobs for video, geometry and illustration.
- `/read/spatial`: authored layered webtoon reader with 2D, VR and AR modes.

The Studio home exposes these entry points. The existing manuscript/collaboration error screen opens local drawing in a new tab without unlocking or replacing the server document.

## Offline contract

The independent editor has pen/eraser, pressure, undo/redo, up to eight layers, reference images, local document reopening, PNG/document exports and self-contained HTML backups. Its separate database is `toonstudio-emergency-drawing-v1`; it does not read/write existing Studio/cloud stores. Atomic revision comparison creates a conflict copy rather than overwriting another tab's work. Storage failures keep the drawing available in memory and request a file backup; a successful download request is not represented as verified disk persistence.

The service worker caches four small rescue files. Navigation connection errors, HTTP 5xx/408/429 and a four-second preload/fetch deadline route Studio navigation to the rescue editor. API mutations are not cached, replayed or queued. A waiting worker is not automatically activated while artists are drawing. The ready indicator requires both cached files and a response from the active controlling worker.

A browser must prepare the application while online before an offline website navigation can work. Alternatively, a previously downloaded self-contained HTML can be opened without reaching the site. First-ever offline access to an uncached site cannot install the application. Browser eviction, clearing site data and private-mode termination can remove local storage: file backups remain necessary. Server-only documents never downloaded to this browser cannot be recovered from an outage by creating an empty replacement. The local drawing JSON is a separate format; PNG is the bridge back into the existing Studio. No automatic conflict-prone cloud upload was added.

To build the independent HTML from this exact source:

```sh
node scripts/build-local-drawing-portable.mjs
```

## Native inference activation

The API uses operator-configured self-hosted ComfyUI only. It never silently calls a paid provider. Running hardware, storage and electricity can still cost money; no new infrastructure or model downloads were provisioned by this change.

Configure `STUDIO_COMFYUI_URL` as an HTTPS origin, or loopback HTTP for a genuinely colocated development server. Do not point a cloud API's loopback address at a separate laptop. Keep the endpoint private behind appropriate network/authentication controls. Optional `STUDIO_COMFYUI_TOKEN` is server-side only. `DATABASE_URL` must use the existing approved database configuration.

Registered migration: `apps/api/src/db/migrations/0045_studio_media_inference_jobs.sql`. Apply it with the repository's normal reviewed migration procedure before enabling generation. It creates an isolated job ledger; it does not remove or migrate existing artwork. Check the migration number against concurrent main changes before merge. This migration has not been executed during authoring.

Default installed model filenames (operator overrides are supported):

| Variable | Default filename | Result |
|---|---|---|
| `STUDIO_WAN_MODEL` | `wan2.2_ti2v_5B_fp16.safetensors` | Generated WebM frames |
| `STUDIO_WAN_TEXT_ENCODER` | `umt5_xxl_fp8_e4m3fn_scaled.safetensors` | Wan text conditioning |
| `STUDIO_WAN_VAE` | `wan2.2_vae.safetensors` | Wan video VAE |
| `STUDIO_HUNYUAN_MODEL` | `hunyuan3d-dit-v2-mv.safetensors` | Geometry-only GLB |
| `STUDIO_SDXL_MODEL` | `sd_xl_base_1.0.safetensors` | 2D PNG from 3D view |

The pinned operator deployment must expose the native nodes used by `studio-media-inference-graph.ts`, including `Wan22ImageToVideoLatent`, `SaveWEBM`, Hunyuan multiview conditioning, `SaveGLB`, and targeted `/api/jobs/:id/cancel`. `/object_info` is checked for nodes, required inputs and exact installed model choices. Missing prerequisites disable the capability. No inference quality or character identity guarantee follows from node readiness: run one real representative input through each pipeline.

The 3D result is inferred geometry, not automatically textured/rigged animation production output. The reverse path renders a self-contained GLB locally, then actually runs SDXL img2img; it is not labeled AI merely because a screenshot was taken. The generated-video compositor joins real generated clips with captions at 832×480, preserving aspect ratio with letterboxing. It currently does not mix an audio soundtrack.

Reference documentation consulted for the native graph contracts:
- https://docs.comfy.org/tutorials/video/wan/wan2_2
- https://docs.comfy.org/tutorials/3d/hunyuan3D2
- https://github.com/Comfy-Org/ComfyUI/blob/master/server.py
- https://github.com/Comfy-Org/ComfyUI/tree/master/comfy_extras

## Operational safety and retention

All jobs are owner-scoped through the existing verified session middleware. Admission uses a PostgreSQL transaction/advisory lock: at most four active global jobs, one active per owner and twelve submissions per owner per rolling 24 hours. Request hashes and idempotency keys prevent accidental duplicate submission. A lost provider receipt becomes `submission-unknown`; it is never automatically resubmitted. Targeted cancellation never interrupts another user's job.

If the provider loses history or a job is indefinitely uncertain, an operator must reconcile the ledger against the exact provider job and queue before releasing reserved capacity. Do not solve this by automatically re-running the prompt. Keep provider input/output/history long enough for that reconciliation. Model input/output retention and deletion need the deployment's approved storage policy; this change does not automatically delete artwork. Successful file download checks MIME, signature, size and SHA-256, but history success does not guarantee provider files will remain forever.

The service uses a bounded database pool and fail-closed admission. A database outage does not submit untracked GPU work. Credentials and arbitrary client graph/node/model/URL inputs are not accepted. GLB imports are self-contained and cannot cause external texture/buffer downloads.

## Spatial scope

The reader imports up to 32 local raster cuts or an embedded portable book JSON. It preserves captions, alt text, authored depth layers, audio and reading position, and supports manual/automatic progression. It has explicit immersive permission requests, VR ray selection, in-world navigation/caption paging, AR plane placement and a front-placement fallback where hit testing is unavailable. Non-XR devices retain ordinary reading controls.

This is an authored layered spatial reader, not AI reconstruction of an entire 3D world. Transparent foreground layers must be prepared by the artist. The book file packages assets, not the complete reader application. Graphic context/device/permission loss must be checked on real devices before release; resource cleanup and bounded texture neighborhoods are implemented but are not headset test evidence.

## Reproducible checks and mandatory release gates

```sh
pnpm install --frozen-lockfile
node scripts/verify-local-first-contracts.mjs
node --check apps/web/public/offline-drawing/app.js
pnpm run typecheck
pnpm run lint:strict
pnpm run build
pnpm exec playwright install chromium
node scripts/verify-local-first-browser.mjs
```

The browser runner uses the actual built service worker and a local fixture origin. It disables all API responses, injects a 503 origin failure and verifies network-offline reload, ink pixels, undo/redo, real IndexedDB revision races, invalid imports and a self-contained HTML reopening. A navigation-policy block must remain a failed/unexecuted gate, not be bypassed or described as passing.

Before merge/release: resolve concurrent main conflicts, pass normal CI/full types/build/security checks, run the browser gate on supported Chrome/Safari/Edge as appropriate, validate saving when storage is denied/full, verify cross-account boundaries with real sessions/Postgres, execute and inspect all three real GPU outputs and targeted cancellation, and test AR/VR entry/selection/end on target devices. No fee-incurring GPU smoke test or deployment is started by the contract suite.

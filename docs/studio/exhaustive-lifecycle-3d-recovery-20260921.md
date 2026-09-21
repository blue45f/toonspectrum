# Exhaustive QA recovery: document lifecycle and production 3D

Base: main `8ad0f0d7341d320f2e1a8b812b2f78cf2e4f0ad3`; parent issue #1905. This increment changes verifiers, not shipped application behavior, API, storage or deployment configuration.

## Reproduced and repaired

- Launch/lifecycle/3D static-only previews reported a local `/api/health/ready` 502 because they do not run Nest. Only the exact loopback-origin 502 observation is classified separately and printed explicitly as backend unavailable, never as an API readiness pass. Other statuses, ports, paths, origins, modules and all page errors remain failures.
- The lifecycle verifier waited for a manual recovery banner even after the real automatic recovery had completed. A passive pre-navigation DOM observer records the shipped notice, including a brief insertion/removal. Explicit manual recovery still uses its real button; blocked/backup-only or unexplained disappearance cannot become successful recovery. No document/storage/permission values are injected.
- The texture proof assumed an unminified `GLTFLoader` export from the actual production bundle. It now identifies exactly one constructor by its public method contract; missing/ambiguous matches fail. No hard-coded minified alias, replacement shader, fixture decoder or alternate renderer is used.
- The complete 3D console verifier explicitly selects the shipped professional workspace before engine diagnostics, and selects the actual imported layer button rather than an ambiguous duplicate text label. Existing artifact, worker, KTX2, context-loss and lazy-loading assertions stay intact.
- Mobile launch references the canonical current-brush editor label and checks parent controls outside the nested inert modal. Its next collapsed line-correction control failure remains unresolved; no full launch pass is claimed.

## Executed evidence

- Actual canonical lifecycle on unchanged production dist: PASS. Original stroke differs from blank; Undo, Redo and reload restore each match their expected image. All 3,110,400 pre/post-reload PNG export pixels are identical. Both legacy localStorage autosave counts are zero; actual recovery mode is automatic. Browser page errors and unexpected response errors are zero.
- Actual canonical `verify:studio-3d-console`: PASS after the fixes. Native macOS Chromium/Metal runs original seven texture fixtures on WebGL2 and WebGPU (14 cases), stable-ID/raster parity, three Magic alignment geometries, VRM insertion and context lifetime, lazy Babylon diagnostics and KTX2 worker/render integration. Unlit color delta remains <=1; no budgets were relaxed. This is not Linux SwiftShader or every 3D feature certification.
- Four synthetic browser observer boundaries passed separately: empty/blocked reject; manual/automatic complete. These are not persistence certification.
- Focused verifier unit/contract tests and normal push gates are recorded on the PR. Main ordinary CI `35558264820` for the previous release was also confirmed successful.

## Remaining failures and environment

The full launch verifier advances through both desktop runs but still fails when it queries mobile correction settings inside a closed details section. The source is `StudioLineCorrectionControls.tsx`; the visible disclosure is “세부 선 보정 설정”. The attempted follow-up edit was blocked by the connected execution service and is not applied or counted as repaired. Other exhaustive lanes and independent PR #1903 remain separate.
A final test attempt failed before collection with ENOSPC. Only this task's generated Vite transform cache was removed, and this conversation's unused preview processes were stopped; source, dist, release copies and evidence were retained. Post-cleanup verification is recorded separately, not merged into the failed run.
Evidence remains under `/tmp/toon-exhaustive-*`, including original red logs, final lifecycle JSON and complete 3D log. No tests/lanes/constraints were removed, and no production deploy is required for this verifier-only increment.

# Virtual Studio exhaustive QA continuation — 2026-09-21

Base main: `8ad0f0d7341d320f2e1a8b812b2f78cf2e4f0ad3`. This repair addresses the 3D console gate from issue #1905, not the complete six-lane exhaustive suite or the original feature backlog.

## Reproduced failures and corrections

1. The actual minified GLTFLoader chunk exports renamed bindings, not `GLTFLoader`. The texture proof now resolves one constructor by its public loader methods, deduplicates aliases, rejects ambiguous/missing implementations, and never instantiates candidates during selection. It still uses the actual production loader, fixture bytes, renderers, textures and capture code.
2. BG3D opens in simple scene-director mode. The verifier explicitly clicks the shipped professional-mode control and checks its pressed state before using professional view/diagnostic/import tabs. The product default is unchanged.
3. Imported models appear in both the visible scene dock and a collapsed sidebar copy. The verifier checks the named native button in the dedicated visible dock; no forced click, hidden-element acceptance or arbitrary first match is used.
4. This verifier starts a static preview without a Core API. It records the exact spawned-loopback readiness 502 separately and visibly. Other status codes, origins, paths, assets, query strings and page errors remain failures. This is not production API readiness certification.

## Executed evidence

- Original full 3D console run reproduced the loader constructor failure. Follow-up runs exposed the mode and duplicate/hidden locator errors, then the precise absent-backend 502. All failure logs were retained.
- Final unchanged full command `pnpm run verify:studio-3d-console`: PASS against the immutable base production dist, Chromium 151 on macOS native Metal plus WebGL2.
- Seven texture fixtures on both GPU backends passed, with the original 900-pixel comparisons, unlit channel tolerance <=1, PBR ordering, depth and stable object/material ID checks unchanged.
- Existing aligned raster/stable-ID proofs and all three Magic layer alignment cases passed. VRM chroma/mannequin restoration, intentional context-loss diagnostics, explicit lazy Babylon diagnostics, actual KTX2 import/render, dedicated workers, canvas PNG change and final teardown all passed.
- Resolver/verifier regression tests: 2 files / 69 tests passed. Five executable module-resolution cases and mode/dock/readiness-boundary coverage were added; no existing assertion removed.
- Web/API typecheck passed in the isolated clone before the last diagnostics-only change; final normal pre-push and exact-head CI results are recorded on the PR. Changed-file ESLint passed.

## Scope and preservation

No application runtime, API, dependency, renderer threshold, CI policy, migration, environment, plan or deployment configuration is changed. A tooling-only merge does not require another Web/API production deployment.
Concurrent uncommitted readiness edits in the previous shared worktree were preserved; this branch uses a fresh independently installed clone. PR #1903 and its working tree were not edited.
Launch and lifecycle failures were also reproduced. The proposed lifecycle-observation edit was blocked by the execution service and was not applied. Their failures and the other exhaustive lanes remain open in #1905; the successful 3D console gate must not be represented as full QA completion or Linux/WAN/multi-user certification.
Evidence files are under `/tmp/toon-qa1905-*`, including `3d-before.log`, `3d-after.log`, `3d-mode-fixed.log`, `3d-layer-fixed.log`, `3d-dock-fixed.log`, `3d-final.log`, `final-unit.log` and `typecheck.log`.

## Final local checkpoint

After the final diagnostics changes, web/API TypeScript, workspace ownership, architecture/app boundaries and changed-file ESLint all passed. The full 3D console gate passed in 30.29 seconds; its single absent-preview-backend 502 remains explicitly logged, not counted as API readiness.
The normal commit-and-push request was rejected twice by the connected execution service with “요청의 보안 상태를 결정하지 못해 … 차단되었습니다.” No alternate write route or hook bypass was used. Read-only inspection confirmed no commit log was created and HEAD remains base `8ad0f0d7341d320f2e1a8b812b2f78cf2e4f0ad3`.
All six changed/new files are preserved locally on `fix/studio-qa1905-browser-contracts-20260921` in `~/.chatgpt-worktrees/toonspectrum-qa1905-isolated-20260921`. This checkpoint has no new PR, merge or production deployment. Remaining next step is the normal commit/push followed by exact-head CI and review; do not mark issue #1905 closed.

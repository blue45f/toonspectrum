# Canvas QA entry repair — 2026-09-22

Status: narrow diagnostic repair, not full #1905 certification.

The production Studio front door is now a workspace home. The canvas chrome and canvas surface verifiers still opened `/studio` and waited for an editor. Reproduced the unchanged chrome verifier timing out after its existing 60-second canvas wait. The canonical launch verifier and application route tests already use `/studio/canvas` for the drawing editor.

Both canvas diagnostics now open `/studio/canvas`. No product route, renderer, memory budget, timeout, device profile, crash detector or existing assertion was changed. Added a mandatory regression requiring the drawing entry while preserving the original chrome/availability and DPR/allocation/tool-transition assertions.

## Executed evidence

- Original verifier: 60-second timeout waiting for `[data-studio-canvas-viewport]`.
- Route/budget/application-home-boundary unit tests: 3 files / 25 tests passed.
- Production chrome verifier: desktop 1440x900 and touch/mobile 360x640 passed. Reliability state remains reachable; no idle prose row or in-flow reliability rail. Mobile notice-strip flow height is zero.
- Production surface verifier now reaches all three DPR cases instead of waiting on home. It still fails on `dpr-2: expected one canonical document-shadow backing size, found 2`. That failure is not suppressed or counted as a pass.
- Attempted detailed JSON/classifier inspection was blocked twice by the connected tool before execution. The retained report is available for the next authorized investigation. Do not guess its root cause or raise the acceptance threshold.

The tested `dist` came from the completed #1935 production Web build; browser sources and packages were unchanged between that built head and the current main merge. This branch changes verification scripts/tests/docs only, so another production release is not required for this correction.

Evidence on the authorized Mac: `/tmp/toon-canvas-qa-before.log`, `/tmp/toon-canvas-qa-after/studio-canvas-chrome-evidence.json`, `/tmp/toon-canvas-surface-qa-after/studio-canvas-surfaces-evidence.json`, and adjacent screenshots/logs.

Keep #1905 open for the backing-size observation and remaining exhaustive/WAN/device verification. Authentication in these local preview diagnostics is an explicit anonymous fixture; no production API or private team document was used.

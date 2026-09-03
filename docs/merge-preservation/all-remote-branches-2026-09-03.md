# Lossless all-remote-branch integration

- Base main: `f8e54c42afc3e4e595c1864444dfa2e48848cf42`
- Recorded branch tips: **46**
- Active source merges: **22**
- History-only safety merges: **11**
- Already inherited tips: **13**
- Conflict paths kept from the current integrated tree: **24**
- Workflow path changes retained through parent history: **43**

Every recorded tip is an ancestor of the integration branch. Conflict alternatives can be restored with `git show <tip-sha>:<path>`.

| Branch | Tip | Mode | Status | Conflicts | Workflow paths |
|---|---|---|---|---:|---:|
| `claude/main-core-red-repair` | `cd2e9cf3933e` | active-merge | active-nonconflicting-current-tree-conflicts | 4 | 0 |
| `fix/studio-service-worker-warm-cache-check-20260903` | `cdc83a6e6ea7` | active-merge | active-clean | 0 | 0 |
| `codex/studio-platform-preflight-safe-slicing` | `df17f4e4b970` | active-merge | active-clean | 0 | 0 |
| `codex/studio-multilingual-emotion-bubbles` | `7b018b1cf04d` | active-merge | active-clean | 0 | 0 |
| `claude/chatgpt-share-analysis-75d1d0` | `82f322cd2902` | active-merge | active-nonconflicting-current-tree-conflicts | 1 | 1 |
| `claude/filter-ui-ux-enhancement-0ec697` | `ab479142b2b0` | active-merge | active-nonconflicting-current-tree-conflicts | 2 | 1 |
| `claude/line-drawing-realtime-transform-c944b5` | `7b16d92953d6` | active-merge | active-clean | 0 | 0 |
| `feat/shaper-character-workshop-20260903` | `c8fcc6baa923` | active-merge | active-clean | 0 | 1 |
| `feat/shaper-surface-paint-20260903` | `adc5024a2762` | already-ancestor | preserved | 0 | 0 |
| `fix/marketplace-wire-authoring-surfaces-20260903` | `029204d27b17` | active-merge | active-clean | 0 | 3 |
| `fix/marketplace-brush-publish-hardening-main-20260903` | `7ad88ff0e628` | active-merge | active-nonconflicting-current-tree-conflicts | 1 | 2 |
| `fix/marketplace-brush-publish-storage-20260903` | `6fbf2c1f2fa6` | active-merge | active-nonconflicting-current-tree-conflicts | 2 | 0 |
| `fix/marketplace-postmerge-browser-regressions-20260903` | `8d17da8aa850` | active-merge | active-nonconflicting-current-tree-conflicts | 11 | 3 |
| `brushfix/soak-harness` | `ee866cfd144c` | active-merge | active-clean | 0 | 0 |
| `codex/studio-autonomous-upgrade-foundation` | `125ab6659084` | active-merge | active-clean | 0 | 11 |
| `codex/studio-vivid-watercolor-edge` | `02d608b18fc0` | already-ancestor | preserved | 0 | 0 |
| `qa/extended-matrix-20260902` | `0b9834a3da13` | active-merge | active-clean | 0 | 4 |
| `qa/extended-matrix-artifact-triage-20260902` | `7e75a830d61b` | active-merge | active-clean | 0 | 1 |
| `qa/studio-authenticated-browser-20260902` | `1ee6c3aa310d` | active-merge | active-clean | 0 | 2 |
| `qa/studio-browser-fault-injection-20260902` | `c3c3bdaee0f7` | active-merge | active-clean | 0 | 1 |
| `qa/studio-chromium-inapp-20260902` | `cafa03a64b61` | active-merge | active-nonconflicting-current-tree-conflicts | 2 | 3 |
| `qa/studio-cross-browser-matrix-20260902` | `1f01ab32cfee` | active-merge | active-clean | 0 | 6 |
| `qa/studio-inapp-full-audit-20260902` | `a20e50486023` | active-merge | active-clean | 0 | 1 |
| `qa/studio-soak-10h-20260902` | `4635522f3b04` | active-merge | active-nonconflicting-current-tree-conflicts | 1 | 3 |
| `archive/main-after-preservation-merges-20260903` | `f8e54c42afc3` | already-ancestor | preserved | 0 | 0 |
| `archive/pr-595-emotion-bubbles-premerge-20260903` | `7b018b1cf04d` | already-ancestor | preserved | 0 | 0 |
| `archive/pr-596-platform-preflight-premerge-20260903` | `df17f4e4b970` | already-ancestor | preserved | 0 | 0 |
| `archive/pr-598-service-worker-check-premerge-20260903` | `cdc83a6e6ea7` | already-ancestor | preserved | 0 | 0 |
| `archive/pr-599-full-head-premerge-20260903` | `cd2e9cf3933e` | already-ancestor | preserved | 0 | 0 |
| `archive/pr-599-main-core-repair-premerge-20260903` | `cd2e9cf3933e` | already-ancestor | preserved | 0 | 0 |
| `archive/pr-603-full-head-premerge-20260903` | `8d17da8aa850` | already-ancestor | preserved | 0 | 0 |
| `archive/pr-604-soak-harness-premerge-20260903` | `ee866cfd144c` | already-ancestor | preserved | 0 | 0 |
| `archive/pr-605-marketplace-wiring-premerge-20260903` | `ae8919d9632c` | already-ancestor | preserved | 0 | 0 |
| `archive/pr-606-marketplace-hardening-premerge-20260903` | `7ad88ff0e628` | already-ancestor | preserved | 0 | 0 |
| `archive/pr-607-marketplace-regressions-premerge-20260903` | `8d17da8aa850` | already-ancestor | preserved | 0 | 0 |
| `automation/final-lossless-merge-sweep-20260903` | `fc01a4d9fc3b` | history-only | preserved | 0 | 0 |
| `automation/finalize-all-preserved-merges-v2-20260903` | `5f7bbf913f01` | history-only | preserved | 0 | 0 |
| `automation/finalize-marketplace-pr-merge-20260903` | `56de02eb1aa2` | history-only | preserved | 0 | 0 |
| `automation/finalize-marketplace-wiring-20260903` | `5f6649e56956` | history-only | preserved | 0 | 0 |
| `automation/finalize-marketplace-wiring-v2-20260903` | `cafbe6ef10af` | history-only | preserved | 0 | 0 |
| `automation/finalize-preserved-work-20260903` | `2a19e3e82472` | history-only | preserved | 0 | 0 |
| `automation/finalize-salvage-pr-599-603-20260903` | `ebf0a6e5e474` | history-only | preserved | 0 | 0 |
| `automation/merge-safe-known-prs-20260903` | `f87d421d7ebb` | history-only | preserved | 0 | 0 |
| `automation/preserve-open-work-runner-20260903` | `e9e7388a9ef9` | history-only | preserved | 0 | 0 |
| `automation/salvage-conflicted-prs-599-603-20260903` | `de6cca7c97b9` | history-only | preserved | 0 | 0 |
| `integration/preserve-open-work-20260903` | `521ba72f89f9` | history-only | preserved | 0 | 0 |

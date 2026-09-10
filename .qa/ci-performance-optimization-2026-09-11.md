# PR CI performance optimization applied

Applied at: 2026-09-10T21:23:57.137175+00:00

## Canonical CI changes

- enabled workflow_dispatch for deterministic rechecks
- expanded root Vitest matrix from 3 to 4 shards
- removed V8 coverage instrumentation from PR and branch recheck runs
- limited LCOV artifact uploads to main pushes
- moved SonarQube analysis to main pushes
- deferred non-required browser job studio-3d-visual until core succeeds
- deferred non-required browser job studio-filter-dialog until core succeeds
- deferred non-required browser job studio-inapp-browser until core succeeds
- deferred non-required browser job studio-inapp-feature-sweep until core succeeds
- deferred non-required browser job studio-p5-brush-real-runtime until core succeeds
- enabled prefer-offline for 11 frozen pnpm installs
- added a permanent direct-PR-workflow fan-out regression guard

## Supplemental workflow event migration

| File | Result | Workflow |
|---|---|---|
| `character-contact-naturalness.yml` | `migrated` | Character contact naturalness |
| `character-merge-validation.yml` | `skipped-pr-context` | Character merge validation (github.event.pull_request) |
| `character-shaper-discovery-quality.yml` | `skipped-pr-context` | Character Shaper discovery quality (github.event.pull_request) |
| `creator-resources.yml` | `migrated` | Creator resources verification |
| `feedback-community-validation.yml` | `migrated` | Feedback community validation |
| `kmas-reference-library.yml` | `skipped-pr-context` | KMAS reference library (github.event.pull_request) |
| `learning-quality.yml` | `skipped-pr-context` | Learning quality (github.event.pull_request) |
| `marketplace-authoring.yml` | `skipped-pr-context` | Marketplace authoring (github.event.pull_request) |
| `marketplace-integrity.yml` | `skipped-pr-context` | Marketplace integrity (github.event.pull_request) |
| `studio-2d-asset-quality.yml` | `skipped-pr-context` | Studio 2D asset quality (github.event.pull_request) |
| `studio-ai-comic-director-complete.yml` | `skipped-pr-context` | Studio AI comic director complete (github.event.pull_request) |
| `studio-brush-filter-stability.yml` | `skipped-pr-context` | Studio brush and filter stability (github.event.pull_request) |
| `studio-cc0-library.yml` | `skipped-pr-context` | Studio CC0 library regression (github.event.pull_request) |
| `studio-collaboration-sync.yml` | `migrated` | Studio collaboration document sync |
| `studio-discovery-ux.yml` | `skipped-pr-context` | Studio discovery UX (github.event.pull_request) |
| `studio-finishing-quality.yml` | `skipped-pr-context` | Studio finishing quality regression (github.event.pull_request) |
| `studio-manual.yml` | `skipped-pr-context` | Studio manual (github.event.pull_request) |
| `studio-mesh-sync-repair.yml` | `skipped-pr-context` | Studio collaboration synchronization (github.head_ref) |
| `studio-production-integrity.yml` | `skipped-pr-context` | Studio production integrity (github.event.pull_request) |
| `studio-promo-video.yml` | `skipped-pr-context` | Studio promo video quality (github.event.pull_request) |
| `studio-vrm-asset-quality.yml` | `skipped-pr-context` | Studio VRM asset quality (github.event.pull_request) |

## Preserved merge contract

- Workflow name `CI` preserved.
- Required job/check name `core` preserved.
- `core` dependencies remain lint, typecheck, build, test, and test-serial.
- `studio-3d-runtime` remains parallel and continues feeding `verify`.
- Supplemental suites continue on main pushes, manual dispatch, or reusable workflow calls.

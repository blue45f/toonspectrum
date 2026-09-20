# Virtual Studio main reconciliation — 2026-09-21

Status: reviewed local merge candidate; remote merge/release evidence is tracked on PR #1890.

User explicitly requested merging to main and continuing refinement. Reconciled current `origin/main` (`0e0f081b3`, including studio-first home, drawing workbench and OST cleanup) into the existing integration branch without removing those features.

Resolved nine conflicted paths. Retained main's personal-space/session navigation, appearance renderer, styles and harness contracts. Retained integration's unsent session form recovery, inbox actor invalidation/15-second read lease and explicit model capacity errors. Exactly one `renderPeerAvatar` prop remains. No CI/security rules, permissions, environment variables, production data or domain configuration were relaxed.

Remaining delta against main: production-board WorkSession entry; session form recovery and its tests; inbox freshness tests; capacity checks; local workspace dependency-ownership gates; corrected 16-suite database-runner assertions; implementation records. Existing world/voice/session authorities already in main are not reimplemented.

Executed on this merged working tree:
- Virtual-space, workspace, shared workspace, work-session, model and runner regressions: **76 files / 761 tests passed**.
- Workspace dependency ownership: **22 dependencies / 14 packages verified**, and **4 guard tests passed**.
- These local tests are not a claim of PostgreSQL, browser, WAN media or operating-site validation. Normal pre-push/CI and exact release checks remain separate.

The prior tool failure involved a batch scripted edit. This reconciliation used standard explicit Git conflict-side selection, preserving the narrow reviewed differences. No safety setting, tool permission, Git protection or validation gate was changed.

Advanced follow-up scope remains as documented in `virtual-studio-session-upgrade-20260921.md`. This merge does not mean all 30 design requirements or production deployment are complete.

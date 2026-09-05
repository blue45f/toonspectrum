# Studio merge recovery — 2026-09-06

This change recovers a usable product diff from the unfinished audit branch. It does not claim that all 120 research requirements are implemented.

## Product changes

- Use the existing editor opaque-ID parser for production routes, including work/remix scope carried in query parameters. Reject duplicated, malformed and conflicting identities without reading a draft database row.
- Key production page lifetime to document identity and return from the production router to the correct work/remix editor. Preserve all six navigation destinations.
- Keep existing local task/review data. Label this surface as a local planner and its versions as task/review checkpoints, not canvas or server versions.
- Do not run planner keyboard shortcuts while an input or IME owns them.
- Integrate the four existing batch-rename production/test files from PR #733 at 7d5f2c63b0e12bb55dfe91db0c6cf2477262c379 into the current multi-selection Inspector. Retain canonical commit and mutation-lock ownership; do not merge that stale PR wholesale.
- Remove the core-CI bypass switch and every skip condition tied to it. Retain all existing jobs, commands, budgets, shards, runtime checks and the fail-closed aggregate gate.

## Local validation

The actual scope module and its existing editor-route dependency compiled with TypeScript 5.8.3 strict mode. 37 direct checks of compiled production scope code passed. TSX syntax checks reported no diagnostics. The CI-structure regression passed. These checks are not full-project typecheck, React integration or whole-application E2E.

Repository-native React/Vitest tests, full lint/typecheck/build/test and browser checks must be evaluated on the final PR revision. A queued, skipped or bypassed check is not evidence of success.

## Remaining scope

PPTX export, server-backed production invites/approval/versioning, general storage-conflict recovery, complete component rendering integration, external-cloud file exchange, and the rest of the unverified research backlog are not completed by this patch. Existing project data is not migrated or discarded. Do not count source retrieval, transfer files or a merged PR as proof of those features.

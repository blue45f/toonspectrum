# Virtual Studio pinned evidence — implementation checkpoint

## Scope and status

This change continues VS-23 (asset use/rights evidence) and VS-24 (AI evidence).
It is an implementation draft, not completion of either full backlog item.
The external guest/mentoring/showcase proposal was not applied: the source-write request failed its tool security determination.

Implemented source:
- Authenticated WorkSession evidence GET, using an attested review capture rather than current `creator_work.doc`.
- Current session participation and work membership checked before and after the metadata read.
- Whitelisted asset placement/recorded rights and AI execution metadata; no prompt text, provider request IDs, seeds, pixel payloads, storage locators or upstream error text.
- Unknown commercial usage remains unknown. Stored token counts are not treated as actual billing or independent provider proof.
- On-demand panel, scoped 15-second metadata leases, hidden/logout/session-change invalidation, source-page navigation and explicit AI note citation.
- Durable session history format, collaboration authority, dependency versions, database schema and production configuration are unchanged.

## Observed verification

- Focused projection tests: 16 passed, 1 failed.
- Combined new evidence client plus existing session workflows/resource regressions: 62 passed, 1 failed (5 files).
- Failure: duplicate AI operation identities retain the first record. The regression requires excluding all ambiguous identities.
- The attempted duplicate-ID correction was blocked twice before execution; it remains unfixed in this draft.
- Additional UI-test file creation and direct disposable database probe were also blocked; no real PostgreSQL end-to-end claim is made.
- Workspace dependency links: 22 across 12 packages verified. `git diff --check` passed.
- Typechecking and ESLint were run separately; their final outcomes must be recorded after reading process results.

Do not merge or deploy while the new regression is failing. No test, hook, threshold or permission check was weakened.

## Type and static-check follow-up

`pnpm typecheck` completed with exit code 0 after restoring the actual tracked translation dictionaries, scene manifests and generated Vello bindings required by the sparse worktree.
The initial missing-file errors were not suppressed. Full Web and API typechecking used the existing compiler settings.
The evidence hook was subsequently changed to keep lease invalidation in effects rather than call `Date.now()` during render; a strict ESLint rerun was started.
The new evidence source test remains failing on ambiguous AI identity; do not mistake successful types or existing workflow regressions for release readiness.

## Remaining validation and original backlog

Before main integration: exclude every duplicate operation ID, rerun all evidence tests, add rendered-panel and auth/visibility/late-response hook tests, run actual disposable PostgreSQL capture-to-session authority tests, validate the final production bundle and exact-head CI.
VS-09 audio recording/retention, VS-13/26 isolated external pinned reviewers, VS-21 native scene/camera review, VS-23 complete release rights lineage, VS-24 authoritative provider receipts/input-output change records and VS-27 independent approved publication are not completed by this draft.
No production deployment, database changes, environment configuration changes or protection/CI weakening were performed.

## Requested merge follow-up — 2026-09-21

- Reproduced the original duplicate-identity regression: 16 passed / 1 failed.
- Count operation identities before projection within the existing 2,000-record inspection budget; exclude every occurrence of duplicate identities rather than retaining the first.
- Added coverage for interleaved duplicates, malformed first records and duplicates after the 100-record output cap. No existing assertion or budget was relaxed.
- Integrated current main, including PRs #1933 and #1934, without source conflicts.
- Related local verification: 11 files / 114 tests passed (projection and existing WorkSession client/component/controller suites).
- This follow-up does not complete the previously listed rendered-panel, authentication/late-response hook, disposable PostgreSQL, full browser or production verification. Remote CI is not awaited under the user's latest merge request.
- No production deployment or protection/CI setting change.

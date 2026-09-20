# Virtual Studio handoff final acceptance — 2026-09-20

Status: current scoped implementation and local acceptance; GitHub check and merge states are recorded on the follow-up PR.

## Main integration and corrective work

PR #1869 was merged as `eaebe839a41cc6ad95f0fb2543d57407ba5f35bd` by a separate session. Its core/verify checks were cancelled, not passed. This continuation starts from main `6c8b07a9199951c1e88c118a498e586c8a3f7dc5`, including the separately merged PostgreSQL handoff-array parameter repair `215cbe957`.

Three client regressions were reproduced before fixing them: a successful read-only reconciliation lost its selected envelope during the next refresh; a first durable action from another tab left the UI permanently uncertain; and an identical envelope ID could mask a different recipient. Reconciliation now retains the selected envelope, converges on the exact same-actor/envelope/digest action while preserving the first receipt, and compares creation task, recipient role, instructions, and remaining notes. Eleven added controller cases include negative identity/digest/field cases.

## Executed acceptance

- Scoped Web/API/model portfolio: 83 files / 850 tests passed.
- Real PostgreSQL review/handoff suites: 2 files / 75 tests passed, including three new handoff acceptance cases.
- Existing browser journeys: 34 scenarios passed across task completion, production linking, replacement review, and verified export; zero page errors. Desktop 1280 and mobile 390 were exercised.

The database run used a fresh, loopback-only PostgreSQL 16 container, the current schema, and all 12 existing Studio invariant triggers. It exercised actual review capture/completion repositories, handoff receipts and concurrent open/accept transactions. Other-tab requests produced one durable record per action. A new repository instance read the same delivery. Changed briefs, revoke/regrant, cancellation, and identical retries preserved immutable evidence and did not approve a review. Test cleanup left zero creator works. Production databases and existing containers were not modified.

Browser journeys still use HTTP fixtures and the real shipped forms/controllers/parsers. These are not production authentication or live-storage browser E2E. New handoff UI behavior is covered through its actual React hook/component tests, controller tests and real database acceptance, not a new dedicated inbox browser harness.

## Evidence handling correction

Seven task-completion screenshots/reports were accidentally tracked in #1869 despite its description saying they were ignored. This change removes only those generated files from Git tracking, preserves their local bytes, and adds explicit ignore entries for all four exercised review QA directories. No unrelated source, worktree or branch is deleted.

The original shared-chat body is still unavailable. This acceptance closes the review/task/handoff continuation and does not relabel every VS-01–VS-30 product requirement, WAN/NAT validation, or production deployment as complete.

## Repeated-database-run repair

A repeat on `25424b1c4` passed 74/75 cases and exposed `studio_project_graph_time_check` during capture completion. The initial 75/75 result above is historical, not a replacement for that failed repeat. Two deterministic tests now put the graph or artifact timestamps ahead of the current database clock; both reproduced their respective time-constraint failure before the fix.

Capture completion now updates metadata with `GREATEST(createdAt, updatedAt, clock_timestamp())` while preserving all existing constraints, authorization, receipts and revision history. The full repaired PostgreSQL portfolio passed 77/77 cases. This models backward/lagging time without attributing the intermittent failure to an unobserved specific clock-sync service. No sleep, increased timeout, skipped assertion or migration is used as the fix.

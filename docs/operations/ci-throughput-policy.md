# CI throughput and verification lifecycle

Status: current implementation in this change. Decision: 2026-09-20.
Scope: GitHub Actions only. No application deploy, paid runner, plan, security scanner,
production secret, database or branch-protection change is part of this rollout.

## Verification ownership

| Surface | Trigger | Guarantee |
| --- | --- | --- |
| CI / core / verify | Every main PR, main push and merge group; manual | Existing lint, type, five semantic shards, performance, accessibility, build and real database gates remain intact. |
| Full Test Diagnostic | Every main PR; manual | One real PostgreSQL + complete root + serial performance suite, without a second automatic copy. |
| Focused domain workflows | Existing changed-area rules | Existing focused coverage is unchanged. |
| Main full QA isolated diagnostics | Daily 17:37 UTC / 02:37 Asia/Seoul; manual | All 22 diagnostic jobs remain; each matrix is capped at two parallel jobs. |
| Main full QA Studio exhaustive | Daily 19:17 UTC / 04:17 Asia/Seoul; manual | Shared exact production build plus every existing exhaustive command; at most two audit lanes in parallel. |
| CodeQL | Existing repository configuration | No language/query/source exclusions, security disablement or paid runner. |

Schedules target the default branch, not a guaranteed execution time. The nightly runs
are staggered, not globally mutually exclusive; long/manual runs can overlap. Matrix
limits are per matrix, not account-wide quotas. The full PR diagnostic still executes
all tests and may take tens of minutes. Green core is not a full-diagnostic success claim.

## Cancellation authority

ci.yml owns core concurrency: obsolete PR heads may be cancelled, but running main and
merge-group checks must finish. Pending main runs may coalesce through GitHub native
concurrency. External cleanup must not override this, including by age-cancelling core.
Closed-PR cleanup runs because the PR closed: it is not stale PR verification. Existing
CodeQL/manual/rerun exemptions remain. Nightly diagnostics preserve in-flight evidence.
No cancellation is proof of success.

## Merge completion and measurement

Resolve the exact current PR head and its pull-request CI run before merging. Require
successful core and verify, plus every effective server-required check. An empty list
of server-required checks is not proof of CI success. Revalidate after a head change.
Report non-required diagnostics separately, including failures; do not wait for every
nightly/main diagnostic to describe a PR as merged. Do not claim an application release
or full-suite success from a green core. No server-side protection is silently weakened.

Measure workflow wall time, job queue delay and assigned-runner time separately. A
cancelled job with no runner/steps is not test execution even when API timestamps exist.
Compare like event types and scopes; one fast run is not a percentile or speed guarantee.

## Regression prevention and rollout

ci-throughput-policy.test.mjs runs in dependency-free core preflight. It rejects duplicate
full suites, removed canonical PR coverage, merge-triggered exhaustive diagnostics and
unbounded matrices. Existing tests retain real database/bootstrap and graphics assertions.

Acceptance: local core preflight, cleanup/integration tests, changed-file lint, Actionlint,
then actual PR core/verify success, normal merge and main configuration verification.
For exhaustive same-SHA release evidence, explicitly dispatch diagnostics rather than
waiting for a future schedule. Do not dispatch runtime deployments for an Actions-only change.
Rollback is a reviewed revert of this change and needs no application redeploy. Record
actual run IDs and merge SHA in the rollout report. CodeQL and full brush sweeps remain
independent performance bottlenecks; this change does not claim their algorithms got faster.

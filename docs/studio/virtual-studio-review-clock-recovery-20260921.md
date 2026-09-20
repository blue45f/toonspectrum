# Virtual Studio review mutation clock recovery — 2026-09-21

## Reproduced defect
Independent release acceptance on main `6b3cb7c7` prepared an empty loopback PostgreSQL database using the canonical CI schema script and preserved all 12 graph invariant triggers. The five-suite run passed 150 assertions and failed one comment resolution with `studio_review_comment_time_check`.

`resolveReviewComment`, `reopenReviewComment`, and `decideReview` used transaction-start `now()` without clamping against durable row timestamps. A stored timestamp ahead of that clock can either violate `updatedAt >= createdAt` or move modification time backwards.

## Correction
The three mutation paths assign `updatedAt = GREATEST(statement_timestamp(), "createdAt", "updatedAt")` within PostgreSQL, after the existing review/comment lock ordering and authorization checks. Terminal `decidedAt` uses the same stable expression. No JavaScript timestamp round-trip is used for this comparison.

The existing status transitions, permission checks, required-comment approval gate, resolution-source attestation, immutable terminal decisions and exact retry responses are unchanged. This is an application-query correction, not a database migration; no trigger or constraint is disabled or weakened.

## Deterministic regression
The existing real-PostgreSQL review-race suite now also covers a comment resolution/reopen lifecycle and each of the four decision statuses with stored future timestamps. SQL checks compare exact persisted instants and terminal decision alignment. Terminal and comment retries preserve their previous results.

The new five cases failed against the original code before the correction. Run the canonical disposable database preparation followed by the review producer, review race, world publication, work session and lock-fencing suites with `--no-file-parallelism`.

## Release scope
Only the repository mutation queries, their integration regressions and this note change. Production data, migration files, secrets, service configuration, deployment gates and cost policy remain unchanged. CI, final main SHA and deployment receipts are recorded separately on the pull request; local passing tests alone do not certify a completed production deployment.

## Consolidated save/restore correction
PR #1900 (`14eccf35`) independently reproduced the same clock problem in generic artifact commit and restore. Its project/artifact metadata clamping and both PostgreSQL regressions are included by ancestry, without changing client-authored immutable revision timestamps.

The overlapping three review mutations retain statement-stable `GREATEST` expressions so decision and update timestamps share one database instant. All other save/restore changes from #1900 are preserved. Final combined CI and deployment evidence must refer to the integration head rather than either earlier individual branch.

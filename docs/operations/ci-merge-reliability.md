# CI merge reliability and queue discipline

Updated: 2026-09-14 (Asia/Seoul). Repository: `blue45f/toonspectrum`.
Baseline inspected: `f5253816416488d4e4b66c589223e861b4e8d7b2`.

## What was actually failing

The Actions snapshot contained 512 active runs: 470 queued, 29 pending, and 13 running.
This is a point-in-time observation, not an ongoing concurrency limit or a measured improvement percentage.
Run [34757013487](https://github.com/blue45f/toonspectrum/actions/runs/34757013487)
was created at 2026-09-13 12:24:45 UTC and its first job started at 14:07:50 UTC:
103 minutes 5 seconds of queue delay before preflight. It also had real lint and build failures.

At the inspected main SHA, `ci-executed-gates.test.mjs` required
`apps/web/src/domains/creator/studio-editor-document-source.test.ts`, but `ci.yml`
did not execute that suite. Two preflight assertions failed. The actual 13-test suite
is now wired back into required static CI; its assertions were not removed or relaxed.

## Trigger policy

The 21 product lanes listed in `scripts/verify-pr-workflow-fanout.py` validate
`opened`, `reopened`, `synchronize`, and `ready_for_review` PR events. A new PR head
must produce a new check; testing only the initial PR is insufficient.

Product push triggers run on main and any explicitly retained integration base,
not every feature branch. PR changed-area filters are preserved. Branches without
an open PR can be checked locally or through the existing manual dispatch path.
The marketplace authoring push filter also retains the benchmark coverage already
present on PRs. No product jobs or assertions were removed.

Use workflow-and-PR/ref-scoped concurrency with `cancel-in-progress: true`.
Do not key obsolete-run cancellation by commit SHA or share a group across unrelated
workflows. Market CC0 delivery now has this policy too.

Required `CI / core` still runs for every main PR, main push, and merge group without
path filtering. Static, serial performance, and production build must actually succeed.
Cancelled, skipped, missing, neutral, or failed dependencies are not treated as success.
The protected status name `core`, admin enforcement, and branch rules are unchanged.

## Fail early, do not weaken checks

Dependency-free preflight runs the trigger validator and mutation tests before installing
packages. Static CI runs strict lint and application/API/worker typechecks immediately
after installation, before the longer product regression groups. Build and performance
validation are preserved. No retries, enlarged budgets, skip flags, or success overrides
were introduced to conceal deterministic failures.

A minimal local preflight is:

```sh
node --test scripts/ci-core-gate.test.mjs scripts/ci-executed-gates.test.mjs scripts/studio-bundle-temporary-allowance.test.mjs scripts/ci-merge-reliability.test.mjs
python3 scripts/verify-pr-workflow-fanout.py
```

For workflow changes, also run actionlint, changed-script ESLint, the relevant product
regressions, `pnpm run typecheck`, and `pnpm run typecheck:cloudflare-realtime`.
The trigger guard uses only Python's standard library. The new Node tests mutate fixtures
to prove that missing synchronize, unbounded push branches, mismatched path coverage,
missing dispatch/self-validation, and broken concurrency fail rather than silently pass.

## Safe queue cleanup

Use a recorded, reviewed run-ID plan. Cancel only superseded verification runs after
re-reading their metadata. For an old open-PR head, verify that the same workflow has a
replacement run for the current head. For an already-integrated feature branch, verify
its SHA is an ancestor of main and no open PR remains. Preserve current heads, main,
release branches, merge groups, security scans, manual runs, and deployment workflows.
Do not force-cancel, disable required workflows, fabricate statuses, or bypass branch rules.

An accepted cancellation request is not proof of completion: read back each selected
run's status/conclusion. Keep the plan and results outside the source tree. Do not rerun
obsolete commits simply because their cancelled checks are red.

## Validation boundaries and deployment policy

Local validation does not prove the full GitHub CI, production build, browser E2E,
visual parity, or GPU acceptance. Known failures observed on older feature commits
included bundle growth, promo text-rendering differences, learning-page browser failures,
and a premium-asset TypeScript mismatch. They were not relabelled as infrastructure
failures, retried until green, or hidden by threshold changes in this patch.

Merge only after the exact PR revision has passed required CI. Do not add `[skip ci]`
to ready-to-merge code changes: hosting deployment suppression and CI validation are
different controls. An incomplete check remains incomplete.

The owner-approved manual-only deployment policy remains in force. This change does
not deploy, reconnect Vercel Git integration, enable previews, run migrations, change
production settings, or authorize paid/larger runners. PR creation or merge is not a
production deployment approval.

## GitHub references

- [Concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
- [Workflow trigger syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
- [Skipping workflow runs](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs)

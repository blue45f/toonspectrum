# CI recovery — 2026-09-10

The previous lint-repair commit was created by a GitHub Actions token. GitHub did not schedule the pull-request workflows for that token-authored head, leaving the protected `core` check in an expected state with zero jobs.

This user-authored commit intentionally retriggers the canonical pull-request CI. It does not bypass, rename, or synthesize the `core` gate.

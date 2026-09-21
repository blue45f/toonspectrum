# Review policy migration and runtime contract repair — 2026-09-22

Status: implemented and locally verified; exact remote CI and merge receipt belong in the PR.

## Reproduced main defect

Main `f9ffa8e4869156bb05d3ae966ded6a8618e69f18` contains `0082_studio_review_policy.sql`, but the managed migration manifest ends at 0081. Calling the unchanged `loadMigrationManifest()` fails with: `Production migration manifest must list every numbered SQL migration exactly once in lexical order`.

The two new policy tables were also absent from the managed runtime grants and readiness table inventory. A successful owner-role schema test would not establish that the restricted API runtime can read/configure/vote on policies.

## Correction

Register the existing 0082 policy SQL in the manifest without altering its bytes or checksum. Include policy and policy-event tables in the readiness and post-baseline relation inventory. Extend the existing graph runtime ACL: both tables permit SELECT/INSERT; only current policy state columns (`policyVersion`, `stateVersion`, `definition`, `configuredBy`, `configuredAt`) permit UPDATE. Review/revision/hash identity stays immutable, and event history has no UPDATE/DELETE/TRUNCATE or delegable permissions. Existing database triggers remain enabled.

Make the migration manifest regression a required CI target so future missing registrations cannot escape the ordinary core checks. Expected migration lists increase by the real new migration; no existing test or migration is removed.

## Executed validation

- Migration/bootstrap/runtime-grant/readiness: 4 files / 138 tests passed.
- Fresh disposable loopback PostgreSQL `studio_policy_runtime_integration_20260922`: existing guarded preparation installed all 15 Studio invariants.
- Actual review-race/preview-producer/work-session repositories: 3 files / 102 tests passed, including a generated non-owning runtime role that can read/update the permitted policy state and insert an event, but cannot rewrite review identity, modify an event or delete event history. Only the generated test role was removed afterward.
- The producer/session tests overlap prior feature runs and are not additive independent certification.

No production migration, database, role, environment, domain, deployment, paid infrastructure or branch-protection change was executed. The SQL is for the existing separately approved migration procedure; API startup does not apply it. Production release still requires explicit operator migration/readiness verification and API/Web compatibility checks. This does not complete external guest UI or the #1905 exhaustive/device/WAN acceptance.

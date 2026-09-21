# Review vote-epoch registration and task completion clocks — 2026-09-22

Status: implementation and local verification complete; remote CI/merge receipt is separate.

## Existing vote-epoch migration registration

Main incorporated 0083 vote-epoch after the earlier 0082 registration correction. The existing migration loader again rejected the manifest because the real 0083 SQL was absent from it. Add the exact existing SQL file to the managed manifest without modifying its bytes/checksum. Update the explicit migration inventory tests to 83 entries. The immutable 0082 policy remains present and checked.

The non-owning runtime integration fixture now inserts a vote with the actual database-validated accessEpoch and supplies the minimal membership SELECT prerequisites needed by the new trigger. The fixture still verifies real allowed updates and forbidden policy identity/event mutation; the production ACL itself is not widened by this follow-up.

## Reproduced task-completion defect

The completion service used the current wall clock even when an existing workspace row had later createdAt/updatedAt values. This could violate creator_work_production_timestamp_check or move updatedAt backwards. Two deterministic real PostgreSQL tests with saved future timestamps failed before the fix.

Use GREATEST(clock_timestamp(), createdAt, updatedAt) on the exact observed workspace revision. The workspace row, serialized document and durable completion receipt receive this same server-generated value. All current-work permissions, lock order, source/criteria validation, CAS conflict handling, exact receipt retry and timestamp constraints remain. A missing/changed workspace revision still rejects the mutation.

## Executed evidence

- Main-isolated migration/bootstrap/readiness/task completion units: 6 files / 161 tests passed.
- Fresh loopback database studio_main_epoch_clock_integration_20260922: 15 actual graph/policy invariants.
- Canonical review-race/producer/session PostgreSQL: 3 files / 109 tests passed, including the two new clock regressions, explicit result/receipt equality, unchanged internal approval, current membership/epoch checks and minimal runtime privileges.
- The earlier larger sharing branch was used to discover the defect, but no sharing server, guest UI or 0084 migration is included in this main fix. Other developers' policy/UI/real-time changes are preserved.

No production migration, runtime role, deployment, environment, domain, price plan or CI protection was changed. Migration registration does not execute DDL or claim operational rollout. #1905's DPR2 backing-size observation and full device/WAN/exhaustive acceptance remain open; external pinned guest UI stays incomplete in Draft #1939.


Remote follow-up: Creator hiring workflow35627547736 failed only its independent migration-inventory assertion (411 other tests passed). The count was still81 despite the two real policy migrations; update that exact assertion and test title to83 while preserving immutable0078 checksum, atomic0080 SQL and every least-privilege assertion. Add that contract to mandatory core targets as well. This is inventory synchronization, not removal of the failed test or relaxation of its source/permission protections. Final exact-head remote results remain separate.

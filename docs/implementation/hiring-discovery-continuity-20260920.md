# Hiring candidate discovery continuity — 2026-09-20

Status: implemented source; deployment is separate.

## Scope

Owner-only live candidate discovery now supports next/previous/first-page navigation instead of stopping at the first30 candidates. A page remains capped at30. SQL filters current disclosure consent, account state, bilateral blocks, role/tools/formats, time, compensation and remaining capacity before the limit. The query reads one extra candidate only to determine whether another page exists. Existing manual/automatic campaign calls retain their30-candidate internal bound and original invitation quotas.

The optional `after` cursor contains a versioned page position and its post/slot/terms/post-version context. It is not signed and is not a credential or snapshot. A caller can choose a position, but every page independently verifies the authenticated owner and current eligibility. Malformed, cross-slot and stale-version cursors fail; they cannot confer access. Query fields and sizes are bounded, and account-order comparison uses the same deterministic collation as sorting. No numeric offset or full-pool total is exposed.

## Client lifecycle

The page loads only after an explicit gesture. Condition, slot, state or parent-post revision changes unmount the old view. Read requests are cancellable and fenced so a late response cannot replace a newer page or clear its loading state. Page errors remain errors with retry and first-page recovery; malformed responses do not become empty lists.

Offer requests are serialized by a ref before React commits button state. Uncertain retries retain their original mutation ID and expiry. Successful sends become disabled in the current discovery session. Availability expiry is refreshed while results are shown and on window focus, with the display clock calibrated to the server's observation time. The server still revalidates every actual offer. Aborting the browser request does not promise that an already-sent server mutation was undone.

Results are live, not a frozen list: newly available earlier account IDs appear after restarting the search. The UI reports only page-local counts, not skill ranking, guaranteed matching or total talent-pool size. No document access, employment contract or payment is granted by discovery or invitation.

## Verification

- Cursor/query/HTTP, request-identity and component lifecycle selection:33 tests passed.
- Hiring/automation/career/meeting and existing injection/main-landmark/sitemap guards on fresh password-authenticated loopback PostgreSQL:219 tests passed,0 failed,0 skipped.
- The132-candidate SQL fixture verifies that100 capacity-exhausted early accounts do not hide later candidates; paging returns30 then2, rechecks opt-out/blocks, rejects other owners/scopes/versions, and preserves adjacent-interval capacity semantics.

No production DB, migration, credentials, provider activation, automatic deployment or existing worktree was changed. Validation outputs remain local under `.qa/hiring-discovery/` and are not application source.

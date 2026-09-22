# Pinned external review / mentoring / approved showcase — server draft

Status: **server implementation and local verification; incomplete product flow; do not merge or deploy yet**.

## Implemented boundaries

This increment adds a dedicated immutable share schema and server path, separate from the legacy live-document external links. A high-entropy capability is revealed once and only its digest is persisted. Exact creation retries recover the same share without exposing another token. Guests obtain only explicitly selected, immutable, producer-attested review images and separate external comments. No work membership, manuscript access, live media, internal reviewer identity or approval authority is granted.

Fresh current owner/admin authority is bound to its grant identity and checked on reads. Revocation, expiry, role loss or regrant invalidate old capabilities. Every image is fetched only through the configured private-object provider, with bounded streaming, MIME/size/digest checks, redirect rejection and a second access check after download. Raw signed URLs never leave the service. Browser origins and explicit request proof are checked; bounded local rate limits are supplemented by durable per-share feedback limits. This is not globally coordinated DDoS protection.

The showcase server path requires a previously approved exact review plus a separate explicit read-only publication command and owner-stated rights. It creates a distinct revocable snapshot, not an edit to the public work or an automatic graph approved Revision/Release. Stated rights and overlay watermark preferences are not legal certification or DRM. Link holders are not identity-verified mentors.

## Schema and release boundary

New migration `0087_studio_pinned_review_share.sql` adds separate share and feedback tables. Shares permit only one-way revocation updates; feedback is append-only. The managed migration manifest, readiness table inventory and least-privilege runtime SQL include this new contract. Runtime grants are SELECT/INSERT plus UPDATE of only `revokedAt` on share metadata; no broad update, delete, truncate or delegable rights are added. An actual non-owning disposable PostgreSQL role test verifies the boundary.

No production migration was run. A later authorized release must apply the managed migration with the existing separate operator procedure, provision the exact runtime grants, deploy API before UI and verify behavior. Do not deploy this draft into a database missing its schema. API startup does not perform DDL. Legacy external links and their data are unchanged.

## Executed local evidence

- Private media/origin/rate admission unit tests: 2 files / 24 tests passed.
- Actual producer/session PostgreSQL, including new selected-page external and mentoring views, concurrent creation/retry, isolated comment receipts, irreversible revocation, role regrant, approved public snapshot visibility and non-owning runtime role: 2 files / 48 tests passed.
- Migration/bootstrap/role contract/readiness regressions: 4 files / 138 tests passed after correcting the readiness inventory and keeping graph-vs-production ACL test ownership separate.
- Fresh loopback database `studio_pinned_share_integration_20260922` has 14 actual Studio invariant triggers. Only this newly created test database and a generated test role were used. The private object store in capture tests is an explicit fixture, not production storage.
- API typechecking passed before final contract additions. Final strict lint, full API packaged build and exact-head CI must be recorded separately after execution.

## Blocked and incomplete UI

The request to write the owner/guest HTTP clients, memory-only viewer access hook and verified image component was blocked before execution repeatedly by the connected tool's security-state determination. No `apps/web/src/domains/creator/pinned-share` files or guest routes were created. No alternate transport was used to bypass that rejection.

Before this feature may be merged: implement owner page-selection/role/expiry/explicit-publication/revocation UI; recover ambiguous create outcomes through exact request IDs without storing bearer tokens; implement an isolated guest view with token only in memory (fragment admission cleared from history), current lease rechecks and cancellation; preserve draft comments across transient errors; connect public approved-snapshot listing; add rendered, accessibility, real HTTP/DB and browser acceptance tests. Confirm no cookie/session permissions leak into guest capability access and no original manuscript/private metadata is exposed. Missing source must never fall back to the latest document.

The backend is not completion of VS-13/26/27. Audio explanation capture/retention, native 3D review, source-edit application, full rights/AI evidence and exhaustive #1905/WAN/device acceptance remain open. PR #1935 is the separate completed and merged evidence-runtime fix.


Final server package check: the full production API build passed 25 compiled workspace/runtime tests, the exact emitted import guard (771 files / 2,417 imports), native-module loading and 7 unchanged legal-policy tests. Strict lint passed for all modified server/migration/contract sources. The guest UI remains absent and the branch is intentionally a Draft; these server checks do not constitute a complete product or production release.


Final combined validation, after adding a server-clock expiry case and object-wrapped parameterized page selections: 7 files / 177 unit/contract/migration/readiness tests passed; 2 files / 49 real PostgreSQL producer/session tests passed. Root Web/API/owned-runner typechecking passed with all 22 workspace links across 14 packages intact. These runs overlap earlier counts and are not summed. No old test or source check was removed to obtain success.


Integration update: the still-unapplied sharing migration is now 0084, after unchanged main0082 review policy and the independently reviewed0083 vote-epoch change from #1941. Both prior SQL files retain their original bytes. #1942 managed migration/readiness/runtime grants are integrated as a dependency, not claimed merged until its own PR receipt. Mandatory test targets and both authors’ tests are preserved. The explicit runtime-role fixture now supplies the same minimal user/work membership SELECT prerequisites used by the new epoch trigger, and still checks actual valid vote insertion and forbidden event/identity mutation.


Integrated schema/epoch acceptance: 7 files / 178 unit/contract/migration/readiness tests passed. A fresh loopback database `studio_share_epoch_integration_20260922` installed 17 actual graph/policy/share triggers. Initial combined producer/session checks exposed an existing task-completion timestamp defect; two deterministic future-clock regressions failed before correction. The completion writer now uses one monotonic server timestamp across workspace row/document/receipt. The original timestamp, CAS, ACL and evidence constraints remain. After correction, the full three PostgreSQL files passed 118 tests, including policy epochs, runtime grants, shared-page permissions and expiry. Source authoring and approval are unchanged by task completion. This small timestamp fix is also being isolated for main; the entire sharing Draft is not ready to merge.


Independent inventory synchronization: the career-confirmation contract still asserted81 migration files, exposed by #1943 remote CI. This Draft has84 real numbered files, so its exact file-count assertion is84; the career SQL checksum/atomicity/least-privilege assertions remain unchanged and the test is a mandatory core target. Main's separate #1943 uses83 because the sharing migration and UI are not merged. Do not confuse these two inventories or execute the Draft schema on production.

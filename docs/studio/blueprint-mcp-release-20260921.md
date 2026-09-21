# Competitive blueprint continuation — 2026-09-21

Status: implemented increment; final main/production receipts are recorded in its PR.
Original blueprint: ToonStudio_Competitive_Blueprint_2026-09-21, F01–F40.
Initial source baseline: `abd60158f17f84a59afa73d7a328eaf4de86d866`.
User explicitly requested continuing the implementation, merging main and deploying production. This does not authorize database migrations, secrets/environment changes, paid plans, domain changes or automatic deployment.

## Implemented and connected in this release

| Blueprint area | Actual behavior | Boundary |
|---|---|---|
| F11 private drafts | Explicit SQLite/OPFS storage, body editing, 20-item/1-MB bound, account + immutable review scope, existing original anchor preserved | Device-local personal storage, not cloud backup. New attachment/drawing payload types are not added. |
| F11 batch publication | Explicit selection + confirmation, durable per-comment ID before request, existing server idempotency, post-request exact record verification, partial/unknown results retained | Not an atomic batch. No automatic replay, no invented server receipt, no automatic whole-batch success. |
| F19 saved smart views | Named bounded filters/layout/sort stored explicitly for account/workspace, re-evaluated over currently supplied readable tasks | Local-only view definitions, no task copies, team-shared collection or permission grant. |
| F20 calendar | List, episode matrix and month/day-grouped calendar share actual task identities and filters; selecting a calendar item returns to the existing editor | No automatic due-date or approval changes. Invalid dates are separate, not silently corrected. |
| F21 dependencies | Explicit inspection of unfinished/missing prerequisites and transitive downstream impact; cycle-safe traversal | No invented work estimates or capacity. Resource scheduling/automatic rescheduling is not included. |
| F07/F39 editing safety | Dirty task input survives equivalent/unrelated refresh, same-task conflict blocks overwrite; exact serialized task/scope and session fences; duplicate-action guard | In-memory edit protection is not a durable draft receipt. Existing repository remains the storage authority. |
| F17/F18 delivery | Existing approved-image ZIP shows source review/revision/digest, approval timestamp, image count and explicit original-image export profile | Actual existing export rechecks ACL, full object list, SHA-256 and decision before download. No platform conversion, signature or recipient acceptance is implied. |

## Private feedback invariants

- Storage reuses the existing SQLite KV table under `studio-private-review-drafts-v1`; no new database schema or browser KV fallback.
- Draft scope includes actor, work, graph, artifact, review, revision and content hash. Signed URLs, tokens, image bytes and member rosters are not stored.
- Unpublished text edits preserve the original comment ID and anchor. A publication attempt locks editing/deletion until its existing result is reconciled.
- The existing server `createReviewComment` validates current comment access, exact immutable source, assignments and same-ID payload replay inside its transaction.
- The batch verifier requires the returned record's author, review, body, severity, anchor, assignments and due date to match. An unexpected/absent record is not success.
- Context/actor change or lost access stops remaining work; already sent requests may have completed and therefore keep their IDs for later reconciliation.
- Terminal reviews still allow a readable private shelf to reconcile an existing publication; new publication remains denied by the server and the batch state check.

## Scope still not represented as complete

This release does **not** close the whole F01–F40 blueprint. Existing previously merged functionality is not reclassified as newly implemented. In particular, the following requirements remain incomplete or outside this release's verification:

- F14 configurable multi-group approval policy with server-side group/version checks; no browser-only substitute was introduced.
- F17/F18 platform-specific delivery profiles, rights-policy approval, durable delivery jobs and recipient acceptance beyond the existing approved-image export.
- F19 team-shared collections/column configurations and F21 actual availability/effort planning (unknown values must not be invented).
- F22 server-side grouped alerts/quiet hours; F23–F29 full planning/import/asset provenance/external file round-trip acceptance beyond existing modules.
- F30–F32 actual multi-account/WAN presenter-follow and confirmed session-to-handoff acceptance, separate from existing presence and review tools.
- F33/F34 paid-provider budget reconciliation and complete AI assistance acceptance; no paid provider calls, credentials or plan changes were made.
- F35/F36 protected workflow automation and general outgoing webhooks with server authorization, signed approved destinations, SSRF protection and deduplication.
- F37/F38 complete role-based onboarding, support/pricing policy and all export-support claims; no unverified pricing, availability or security promise is added.

These are product/backend/verification work, not missing buttons to label complete. A provider/workspace confirmation is not authorization to change production secrets, database schema or commercial policies.

## Verification evidence

- Actual Chromium fixture at 1440px and 390px: dirty edit → calendar → same editor, concurrent task conflict, explicit latest reload, SQLite saved view, private draft save → page reload → both recovered. Every API request was blocked; no server write occurred.
- The fixture is an actual-component, actual local SQLite/OPFS test with synthetic task/account data, **not** production authentication or database/WAN acceptance.
- Private draft repository/publisher and UI: 20 focused tests passed, including durable-before-send, lost response, exact same-ID reconciliation, partial failure, actor/source isolation, capacity, corrupt storage and unavailable writes.
- Existing pinned review/approval/comparison regressions and approved-image export regressions retained; full shard and exact main CI results are recorded separately in the PR.
- No test, CI gate, branch protection, renderer policy or storage-authority gate was disabled.

Reproduce local browser check: run `pnpm exec vite --host 127.0.0.1 --port 4472 --strictPort`, then `node scripts/verify-blueprint-mcp-workflow.mjs`. Evidence is generated under ignored `artifacts/blueprint-mcp-workflow/`.

### Completed local gate snapshot

- `node scripts/ci-core-regression-shards.mjs studio-foundation`: **238 files / 5,682 tests passed**. This is one semantic shard, not a claim about all repository tests or production security.
- `pnpm run typecheck`: Web and API passed after new testing-library query options were corrected without changing assertion semantics.
- `node scripts/verify-blueprint-mcp-workflow.mjs`: both 1440px and 390px passed using actual SQLite/OPFS save/reload and zero API writes.
- Screenshots were inspected. Focused/component test counts overlap the shard and are not added into a misleading unique-test total.
- GitHub exact-head checks and manual deployment identity must be recorded from provider results, not inferred from local gates.

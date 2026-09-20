# Creator platform integration — 2026-09-20

Status: **implemented source; operator activation and production deployment are separate**.

## Source integration

This integration preserves the committed hiring checkpoint `f99f2a8db`, latest-main fixes, and counterparty career confirmation `af815ba39`. It does not overwrite the original locked hiring/career/brush/world/3D worktrees. The conflicting automation drafts were reconciled only in this integration worktree.

### Completed in this continuation

- Public hiring search has explicit retries, backward/forward cursor navigation, filter reset, page-local counts, embedded post pagination, current-request identity and abort fences. Seven component regressions cover these flows.
- Urgent in-app invitation automation uses one canonical `creator_hiring_campaign_job` schema, immutable per-generation round receipts, parent-locked claims and effects, lease fencing, restart recovery, bounded retries and default-off worker lifecycle. It uses the same eligibility, capacity and quota checks as manual invitations.
- Changing terms, closing a post, suspending the recruiter, stopping the campaign or exceeding a task deadline prevents old work from dispatching. A lost acknowledgement cannot duplicate a committed round. No HTTP endpoint accepts internal claim tokens.
- The post screen exposes explicit version-bound consent, start, current status and cancellation. Uncertain starts keep their mutation ID; changed terms clear consent; unmounts abort requests. Capability-off preserves manual hiring and does not start a timer in the backend.
- Migration 0079 is now complete and atomic. Migration 0080 counterparty confirmation has moved from pending into the managed sequence. Both least-privilege ACL and capability contracts are wired into the existing approved migration runner and standalone verifier.
- A focused GitHub Actions workflow executes the actual disposable PostgreSQL tests and hiring UI tests. Existing required core/verify gates, workflows and branch protection are not disabled or replaced.

## Runtime boundaries

`CREATOR_HIRING_AUTOMATION=in-app-v1` is an explicit operator opt-in, not a value this change writes. Default/off/unsupported transport cannot dispatch. The worker is sequential, at most two jobs per tick, five attempts per generation, with five-second initial backoff and thirty-second leases. It sends only website inbox invitations, not external email/SMS.

Initial and second invitation rounds remain bounded to five and ten recipients respectively, with a five-minute interval. Current consent, blocks, remaining capacity, task deadlines and account state are rechecked. Sending is not delivery/read/response, an employment contract, payment or manuscript access.

The 0078 migration remains byte-identical with SHA-256 `c8094e53ce497dfd8f0649adb3e51ad67ae4a67f27d4547b5863484d2e8e2085`. No production/operator database was migrated. New native tests initialize only password-authenticated loopback disposable databases and remove their own schema/database/server afterward.

## Validation and environment repair

The integration previously reused a node_modules link whose workspace packages resolved into a different active worktree. Only this checkout's dependency links were replaced with its own offline frozen-lockfile installation. No other checkout's modules, source, processes or package versions were changed. The unchanged whole-web TypeScript 6.0.3 check then completed successfully; no test roots, type inputs or strictness settings were removed. The final source still passes through the normal pre-commit/pre-push checks and PR checks.

Native coverage includes worker claim contention, lost acknowledgements, repeated rounds, manual/automatic races, cancellation, generation changes, recruiter suspension, opt-out and blocking, deadlines, max retries, missing optional readiness and non-owner runtime privileges. Existing 14 hiring and 17 career native cases plus 11 CSRF cases remain enabled.

## Explicitly not claimed by this checkpoint

Production deployment, production migration, external provider credentials/rights approval, real SFU/TURN calls, hiring-to-production RoleAssignment activation, image-original exhibition and verified production-based activity awards are distinct gates. The original interview implementation remains private waiting/admission/text/device testing, not a configured video service. Career badges mean counterparty confirmation, not independently verified employment or ability. Work from other active brush/world/3D sessions is not counted as this implementation's acceptance evidence.

## Final integration evidence

- The ordinary root hiring/meeting/career/automation/migration/CSRF/UI portfolio passed 309 tests without skips on a fresh disposable PostgreSQL database. Fortune directories separately passed 219 tests (20 overlap with the prior selection).
- Actual empty-database bootstrap through managed 0080, including the separated runtime role and all capability verifiers, passed on local PostgreSQL 17.10 with the already installed psql client. The new helper sources are included in the bootstrap drift fingerprint. Bootstrap/manifest/capability contract tests passed 109 tests after exact inventory updates.
- The existing fortune browser script passed full-deck identity, calendar fallback, period selection and 320/390/768/1440px overflow checks without page errors. No external provider was enabled or called successfully as evidence.
- A public hiring browser journey passed error recovery, next/back pages, filtering/reset and the same responsive widths. This uses intercepted synthetic API responses; it is UI integration evidence, not a production hiring E2E claim.
- Normal pre-push on the integrated tree passed whole Web/API typecheck, architecture, source lint, secret scanning and the existing security/license audit. Current PR CI remains the merge authority; no failures are converted into success or ignored.

## Merge closure corrections

The full diagnostic suites exposed three integration contracts not exercised by the earlier focused selection: explicit controller injection tokens, the AppShell-only main landmark, and public sitemap destinations. All were repaired in source, with those existing tests added to the focused hiring workflow. No test inventory or strictness was reduced.

The creator-hub workflow exhausted its old 8GiB V8 heap while the same complete Web check passed in core at 12GiB. Its budget now matches core without changing runner class, timeout or validation commands. Its synthetic API fixture now returns the actual public-positions envelope. Malformed optional hiring responses are validated before rendering and remain local errors instead of crashing the original post. New component and desktop/mobile regressions protect this behavior.

Reference browser clicks were blocked by the real first-visit dialog. The existing visible-dismissal helper is now installed in every reference page fixture; the product gate itself is unchanged. Desktop/mobile creator browser checks passed ten cases after the corrections.

Local merge-closure verification: the current production web build passed; all 13 reference browser cases passed against that build. All 10 desktop/mobile creator-hub cases and 11 public-positions component cases passed, including the deliberately malformed response regressions. Browser APIs are synthetic fixtures, not production service evidence.

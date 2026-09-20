# Creator hiring platform — bounded implementation checkpoint, 2026-09-20

> Integration update: see `creator-platform-integration-20260920.md` for the later managed 0079/0080 integration and current verification. This document retains the earlier checkpoint evidence.

Status: **current source finalized for coordinator review; the entire design is not complete**. Changes remain uncommitted in `/Users/hjunkim/.chatgpt-worktrees/toonspectrum-creator-hiring-platform-20260920`, branch `feat/creator-hiring-platform-20260920`, base HEAD `2981170a292fbe83a57b2a2913d6ddcfa3cbde74`. Existing feature work and ignored coordinator tools/logs were retained. No other worktree, production database/environment/secrets, commit, push, merge, deployment, browser injection, or additional coding agent was used. No CI protection or required-target manifest was edited.

This checkpoint closes the requested implementation blockers and records the remaining execution and owner gates. The original application/post, user and message-block tables remain authoritative. New shared DTOs have Web and API consumers; application source does not cross those boundaries. The separately owned health-readiness source was not edited.

## Finalization changes

- Registered `0078_creator_hiring_workspace` in the approved production migration manifest. Exact inventory checks now assert 78 entries, 78 distinct checksums and last migration 0078; historical checksums and sequence checks remain intact. No historical migration changed.
- Wrapped 0078 in `BEGIN`/`COMMIT`. Its final SHA-256 is `c8094e53ce497dfd8f0649adb3e51ad67ae4a67f27d4547b5863484d2e8e2085`.
- Added `scripts/creator-hiring-database-contract.mjs`: all 23 hiring relations and 11 functions are covered. Runtime gets bounded column updates, no UPDATE on resume/career versions or receipts, no direct version deletion, and read-only activity awards. PUBLIC table/column/function exposure and grant options are rejected; runtime role ownership, membership and schema DDL are rejected. Existing authority dependencies receive only required DML. Privacy triggers run with invoker permissions; there is no SECURITY DEFINER bypass.
- The approved migration runner normalizes hiring ACLs and executes the hiring capability check. The existing standalone capability verifier executes the same contract. Every hiring API transaction calls the atomic migration's `creator_hiring_require_ready()` before application work and rolls back with 503 on missing schema/ACL/function. API requests cannot provision schema, synthesize success or fall back to memory. Generic global health has not been expanded; the focused hiring gate and deployment verifier provide this integration.
- Hiring transactions use transaction-local `statement_timeout = '10s'` and `lock_timeout = '3s'`, including advisory locks, with rollback and no automatic retry. These are per-statement/wait limits, not a promise of a ten-second end-to-end request deadline.
- Native PostgreSQL fixtures now explicitly truncate both `"${schema}"."user"` and `"${schema}".creator_hiring_outbox` before each case. The two original all-outbox assertions remain unchanged. All test DBs are disposable fixtures, not operator databases.
- Candidate discovery now uses one set-based SQL read: exact role/tool/format/rate/date/consent/block filters, followed by a grouped interval sweep for capacity, followed by `ORDER BY user_id LIMIT 30`. No first-100 cutoff remains. Adjacent intervals do not consume simultaneous capacity. UI explicitly describes the 30-result bound and absence of a next page; no global total or skill ranking is claimed. Mutation-time ordered locks and fresh eligibility checks remain.
- Submission retry reruns both list and selected-version loading. Resume and version errors are separate, aborted/stale responses are ignored, cross-resume versions are excluded, and version changes clear portfolio choices and consent. The parent remains keyed by post plus actor; actor unmount drops private state. Deletion/consent copy distinguishes derived resume payload erasure from original application message/contact erasure through withdrawal.
- Employment and freelance-task terms require paid compensation. Unsupported revenue-share is blocked in API validation, offer confirmation and UI with an explicit explanation. Unpaid co-creation/partial collaboration remains possible. Acceptance is preliminary terms agreement/reservation; no employment contract, payment or document-access success is claimed.
- Fixed the coordinator's additional task-deadline regression: matching rejects elapsed `terms.dueAt`, batch SQL checks dueAt before LIMIT, send/accept recheck a fresh DB clock after locks/queries, hold expiry is capped at dueAt, old holds expire at `ends_at`, and offer/invitation projections cease to be actionable after the task deadline. Past starts with future due dates remain permitted. No dynamic `now()` CHECK was added.
- Fortune remains default-disabled externally. The generic normalized payload is explicitly an internal fixture contract; actual FreeHoroscope supplier integration and unknown-source-timezone handling are **unimplemented**. Its documented `{data:{date,period,sign,horoscope}}` shape is tested as unsupported and never relabeled as an external “today” result. There is no approved commercial/cache supplier, host-page wiring or paid fallback; occupied FortunePage was not edited.
- Ordinary root Vitest glob discovery includes every new `*.test.ts`, `*.test.tsx` and `*.test.mjs`; no custom-config-only test claim. Root config now skips operator dotenv reads when an explicit test target is supplied. No test inclusion root, required CI target, security test or test-coverage floor was removed.

## Design coverage matrix

“Implemented” below means the described source flow and listed tests exist. It does not imply browser E2E, production migration or deployment acceptance.

| Design area | Current implementation and evidence | Remaining gate / explicit limit |
| --- | --- | --- |
| Collaboration board and application authority | Existing `/collaborate` post/application lifecycle is reused; hiring panels extend existing owner/applicant screens. Legacy repository tests retained. | Existing legacy application authority remains; no parallel application store. Browser journey unverified. |
| Public role/position search | Published one-person slots expose role, model, tool, format and compensation filters; 31-row lookahead returns a truthful 30-item cursor page. | Public projection only; no private application/contact fields or paid ranking. |
| Structured resume authoring | Role, tools, formats, languages, contribution/episode experience and permitted HTTPS portfolio links; own immutable versions and revision checks. Resume API/component tests. | Self-declared content; no credential verification or remote portfolio fetch. |
| Resume preview/export | Preview plus user-triggered print/PDF through browser print. Component tests. | Real print layout/browser export not smoke-tested. |
| Versioned application submission | Select a stored version and portfolio subset, explicit consent, server-owned snapshot, post-version check, durable mutation receipts. Resume/security tests and disposable DB evidence. | Original message/contact is distinct from derived snapshot content. |
| Submission retry/privacy | Selected version is requested again on retry; aborted stale replies cannot overwrite current selection; new version requires new consent; actor-keyed parent preserved. Five component tests. | Browser account-switch flow unverified. |
| Withdrawal, resume deletion, rights and account deletion | Legacy withdrawal and account status triggers erase derived payloads; career rights revocation blocks derived resume submissions; reapply/rejoin do not revive old private content. | Resume deletion alone leaves original application message/contact; user must withdraw it. External source URLs remain owner-managed. |
| Hiring terms | Quantities, explicit timezone/absolute dates, role, tools, formats, rates, review/credit/NDA/portfolio/AI policies, optimistic revisions. | Employment/freelance must be paid. Revenue-share cannot be saved/confirmed until a bounded supported policy exists. No contract/payment execution. |
| Availability | Explicit discovery and notification opt-ins, maximum two-hour confirmation life, capacity and period limits. | Presence or an open screen does not renew availability; no inferred availability. |
| Candidate matching | One batch SQL read, factual filters and peak-overlap capacity before result truncation. Real candidate-101/query-count regression in native suite. | Candidate view is the first 30 eligible account IDs, no next page or overall count. No protected trait, paid plan, level or fortune ranking. |
| Offers and preliminary acceptance | Targeted expiring offers, decline/cancel, idempotency, post/slot revision and accept-time consent/block/capacity/date revalidation, serialized reservations. | Pending onboarding only, no manuscript/document permission granted. |
| Task deadline and hold lifecycle | Fresh DB-clock dueAt check after locks; min(30 minutes, dueAt) hold; expired old holds and invitations cannot remain actionable. Unit and new native regression. | Final native suite includes an additional 14th test; require a final run after deadline changes. |
| Manual urgent campaigns | Explicit manual first batch up to 5, second up to 10 after 5 minutes, two rounds, duplicate/daily/post bounds, stop and opt-out; account-order mutation locks. | Automatic dispatch remains disabled; no background worker or external email/SMS transport; no guaranteed match speed. |
| Invitation inbox | Targeted private inbox with read/interested/decline/stop and live parent/consent checks. | Interest is not application, acceptance or contract. |
| Teams and groups | Persistent named team, targeted expiring/revisioned invite, accept/decline, group scope, member removal and last-owner checks. | Team/group membership grants no Studio document authority. |
| Interview/meeting scheduling | Application-specific interviews and team meetings, bounded schedules, participant overlap checks and private room invitations. | No external calendar/SFU integration. |
| Waiting-room privacy and text | Host admission/removal/end; guest sees own/host roster; admission epochs fence old state/messages; lobby/admitted text scopes; withdrawal/removal/account status revoke access. | Real browser/realtime media journey unverified. |
| Devices and real calls | Local device test component handles permission and cleanup; server truthfully returns media `not-configured`. | No configured audio/video provider, real peer call, TURN/SFU, recording or transcription test. |
| RoleAssignment/production activation | Durable `role-assignment-requested` outbox and pending reservation receipt; `documentAccessGranted: false`. | Blocked on owner reconciliation: 0053/schema constrain modelVersion 1 while production repository mutations require 2. No worker or fake activation added. |
| Career and provenance | Immutable self-declared career versions, private/public rights controls and server-validated career-version-to-resume copies with revocation. | `proof: self-declared`; no verified employer/work contribution credential. |
| Public exhibition / portfolio authority | Public gallery projects approved-for-sharing career links and contribution text. Existing creator portfolio/release/publication authorities remain separate. | Link-only exhibition; no image upload, image processing/cache, publication authority or integrated image exhibition is claimed. |
| Activity and level | Read-only summary/ledger projection, explicitly no hiring or verification effect. Runtime cannot insert awards. | No automatic activity/shortlist/hiring awards; ingestion waits for verified production completion/reversal authority. |
| Fortune provenance | Local deterministic source/date is labeled; bounded disabled-provider adapter with timeout/cache/circuit tests, no personal DOB/name sent. | No approved external supplier, actual FreeHoroscope normalizer or FortunePage host wiring. Unknown supplier timezone is not invented. |
| Brush, world, avatar and work modes | Existing ownership boundaries preserved. | Owned by other work; not implemented or validated in this pass. |
| Runtime migration/security | Atomic 0078, exact manifest inventory, least-privilege ACL/capability contract, fail-closed hiring gate and bounded locks; real coordinator runtime-role checks. | Full production migration chain and global health-owner integration review remain separate. No production DB applied. |
| Delivery / user journey acceptance | Local source/type/lint/architecture checks and component/repository tests recorded below. | Browser E2E was denied earlier and not attempted here. No deployment/CI/production-readiness claim. |

## Exact local verification

All logs below are under ignored `.qa/creator-platform/`; `.exit` files contain the recorded process exit status. Explicit test URLs are fixed unused loopback fixtures and are not operator credentials.

| Command | Exit / count | Evidence |
| --- | --- | --- |
| `pnpm run lint:quick` | 0; 74 changed source/config/test files | `final-lint-reviewed.log`, `.exit` |
| `pnpm --filter @webtoon-nest/api run typecheck` | 0 | `final-api-typecheck-complete.log`, `.exit` |
| `NODE_OPTIONS=--max-old-space-size=12288 pnpm exec tsc -p tsconfig.json --incremental` | 0 after final test/source corrections | `final-web-typecheck-complete.log`, `.exit` |
| `pnpm run validate:architecture` | 0, includes app boundary gate | `final-architecture-complete.log`, `.exit` |
| `node scripts/verify-toolchain-coverage.mjs` | 0; 4,584 discovered test files across 5 roots, 9,379 type inputs | `final-toolchain-coverage-complete.log`, `.exit` |
| Ordinary root Vitest command printed below | 0; **204 passed, 14 opt-in PostgreSQL skipped**, 20 passed files / 1 skipped | `final-root-sandbox-compatible.log`, `.json`, `.exit` |
| Same root selection plus `apps/api/src/csrf-middleware.integration.test.ts` | 1; 204 passed, 25 skipped; the CSRF suite setup cannot listen on 127.0.0.1 (`EPERM`) | `final-root-tests-complete.log`, `.json`, `.exit` |
| `node .qa/creator-platform/run-committed-postgres.mjs` (executor sandbox) | 1 before tests; `initdb` shared-memory `shmget` rejected with `Operation not permitted`, testExit null | `final-committed-postgres.log`, `.exit`; prior coordinator logs archived in `before-finalization-formal-logs/` |
| `git diff --check` | 0 | Checked after final source changes; new files also linted |

```sh
DATABASE_URL=postgresql://test:test@127.0.0.1:1/toonspectrum_test pnpm exec vitest run --config vitest.config.ts apps/api/src/session-middleware.test.ts apps/api/src/modules/collaboration/hiring- apps/api/src/modules/collaboration/collaboration.repository.test.ts apps/api/src/modules/recruitment/ apps/api/src/modules/meeting/ apps/api/src/modules/fortune/fortune-provenance.test.ts apps/api/src/modules/fortune/fortune.controller.test.ts apps/web/src/domains/collaboration/hiring/ scripts/creator-hiring-database-contract.test.mjs scripts/run-production-database-migrations.test.mjs scripts/verify-production-database-capabilities.test.mjs --maxWorkers=2 --no-file-parallelism --reporter=default --reporter=json --outputFile.json=.qa/creator-platform/final-root-sandbox-compatible.json
```

The expanded root invocation was exactly the same selection with `apps/api/src/csrf-middleware.integration.test.ts` immediately after `vitest.config.ts`, and reporter output changed to `.qa/creator-platform/final-root-tests-complete.json`. It was run, not silently dropped from reporting. The unchanged CSRF suite remains in normal discovery and requires a sandbox-external localhost-capable rerun. The coordinator's earlier ordinary-root baseline was **122 passed / 10 opt-in PostgreSQL skipped** (exit 0); it is preserved as prior evidence, not relabeled as this executor's final run. The final root subset adds the new tests while using the ordinary root setup/config, rather than only `scripts/creator-hiring.vitest.config.mts`.

Initial local iterations are retained: first root run 190 passed / 1 failed / 12 skipped (a component test file-URL fixture error, fixed); first lint exit 1 (snapshot error-state rename corrected); first web incremental exit 2 (test action mock returned void rather than boolean, fixed). No unrelated team's source was changed to suppress a failure.

## Independent coordinator PostgreSQL evidence

These are **coordinator-executed, real PostgreSQL 17.10 disposable fixtures**; the executor read the result artifacts. None is production or full-chain migration evidence. Keep their timestamps and migration hashes distinct.

| Reported command or harness / artifact | Snapshot result | Scope and freshness |
| --- | --- | --- |
| `postgres-review.mts` (coordinator harness) / `postgres-review-result.json` | 13/13 at `2026-09-19T22:05:41.225Z` | Resume/version/snapshot/privacy/retry checks; migration hash `f33ae4ea32e63dfe2c9f4f100475df1d43a06c57f10d7fa8c2364fcdb05647cc` predates final atomic/readiness changes. |
| `offer-postgres-review.mts` (coordinator harness) / `offer-postgres-review-result.json` | **11/11 at `2026-09-19T22:34:50.007Z`** | Includes 100 competing accepts and the corrected elapsed-task-deadline scenario; final migration hash `c8094e53ce497dfd8f0649adb3e51ad67ae4a67f27d4547b5863484d2e8e2085`. Supersedes 10/11 at 22:26:24Z and the earlier 10/10. |
| `team-meeting-postgres-review.mts` (coordinator harness) / `team-meeting-postgres-review-result.json` | 21/21 at `2026-09-19T21:59:35.378Z` | Rejoin/reapply and room privacy; hash `071375e4b5695e2a4bbe6dd5dd719fb012e1a65d4b0ee35cc10319d183c76ee4`. |
| `campaign-career-postgres-review.mts` (coordinator harness) / `campaign-career-postgres-review-result.json` | 19/19 at `2026-09-19T22:10:22.467Z` | Campaign/rights/account deletion, no shortlist reward; hash `f33ae4ea32e63dfe2c9f4f100475df1d43a06c57f10d7fa8c2364fcdb05647cc`. |
| `node --import tsx .qa/creator-platform/runtime-acl-postgres-review.mts` / `runtime-acl-postgres-review-result.json` | 9/9 at `2026-09-19T22:30:52.703Z` | **Final migration hash matches** `c8094e53ce497dfd8f0649adb3e51ad67ae4a67f27d4547b5863484d2e8e2085`. Non-owner runtime save/version/submit/withdraw/delete, trigger cleanup, denied immutable UPDATE/DDL/award INSERT, detected/repaired column grant drift. |
| `node .qa/creator-platform/run-committed-postgres.mjs` outside executor sandbox | exit 0; 13/13, started `2026-09-19T22:33:48.245Z`, completed `22:33:55.051Z` | Guarded password-authenticated loopback disposable DB; server stopped and DB removed. Candidate101, exact runtime ACL and blocked-lock timeout passed. Predates the final 14th task-deadline test. |

Latest independent artifacts may advance during read-only coordinator verification. A later result must record its own timestamp/hash and must not be inferred from the older successful runs above.

## Remaining review gates and stop point

1. Rerun final **14-test** committed PostgreSQL suite after deadline fixes (the independent 11-scenario offer harness has already passed after the fix), outside the executor sandbox through the already reviewed isolated coordinator harness. Do not apply migration 0078 to any preexisting/operator/production DB for this checkpoint.
2. Rerun the unchanged **11-test CSRF localhost suite** with the final ordinary-root regression selection in an environment allowed to bind its test server. Current executor failure is environmental; it is not reported as a passing final full suite.
3. Review the full migration-chain/managed-ledger integration against an appropriate disposable baseline separately; focused fixture and runtime ACL checks do not prove that chain or production readiness.
4. Browser E2E, real media calls, print/browser layout and production activation remain unverified. No browser attempt or store injection was made after the prior denial.
5. RoleAssignment model-version compatibility, production activation worker, automatic campaigns, image exhibition, verified career/activity ingestion, approved fortune supplier and occupied host-page integration remain the explicit design/owner gates in the matrix. They are not part of an unlimited follow-up expansion.

Leave all changes uncommitted for coordinator review and stop at this checkpoint. Any production deployment needs its own explicit approval under AGENTS.md; none was requested or performed.

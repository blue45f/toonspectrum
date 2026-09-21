# Resumed blueprint: review groups and guarded operations

Status: implementation and local verification; exact commit/CI/merge receipts belong in the PR.
Resumed worktree: `toonspectrum-blueprint-completion-9a82d6`, branch `feat/blueprint-completion-9a82d6`.
Integrated baseline: `09aff47d91be4be8b1b3192d8898ad64e4883edf`.
The previous uncommitted implementation was preserved. An incomplete notification-policy component was finished rather than starting a duplicate worktree.

## User-visible scope

- F14: fixed-review group configuration, parallel/sequential groups, explicit policy-change reason and consent, group votes, current eligibility and quorum, stale downstream votes, and separate explicit final approval. Policy/source/state expectations are checked by the repository and final approval path. Configuration and votes have exact request identities and append-only event history.
- F21 (partial): missing estimates, missing/invalid resource calendars, missing assignments/dependencies and cycles are shown as incomplete inputs. Unknown effort is not presented as zero or a reliable completion forecast. This does not implement a complete resource-level scheduling optimizer.
- F22 (partial): actual editable cadence, timezone, quiet hours and escalation preferences; explicit consent, same-content expectations checked on the server, unchanged timestamp conflicts, failed-input retention, and actor/session isolation. Inbox entries are grouped for the selected active assignment by existing source identity and only safe same-project links are opened.
- F35 (bounded): the shared deterministic planner is used for the visible preview and independent server recomputation. One confirmed command persists only matching generated tasks/notifications and evaluated rule records; altered output, inactive creators/recipients, stale evaluation and recursive generated sources are rejected. There is no automatic approval, publication, payment or external execution.
- F36 (configured transport hardening): server-configured HTTPS webhook destinations use public-address validation, DNS pinning, redirect refusal, bounded body/response/time, request identity/timestamp/signatures and uncertain-result preservation. The existing provider path is reused; this is not a new public API or unrestricted user-supplied webhook product.

Notification preferences do not install a scheduler, contact a recipient, register a browser subscription, or guarantee connected email/push delivery. Manual in-app reading remains possible during quiet hours. No real external provider calls were made in these checks.

## Authority and compatibility

Web, runtime-neutral models and API repositories remain separate. The existing review/source/required-comment rules, aggregate CAS, same-ID replay and SQLite storage authority are preserved. No package/dependency or bundle budget change is introduced.

`0082_studio_review_policy.sql` is an additive migration included as source, NOT executed against production. It adds policy and event tables and three database guards. Ordinary policy/event edits or deletion are rejected. Child cleanup is permitted only after the existing parent review is removed by the existing authorized whole-work deletion path; owner authorization and all-history transactional cleanup remain intact.

A new regression reproduced the initial WIP's foreign-key restriction breaking owner work deletion. The cascade was corrected without disabling immutable-history triggers. Current data inside an existing work is not editable history, and a policy does not create a new legal retention obligation or prevent the owner's existing whole-work action.

Deployment handoff (not executed here): prepare/verify migration 0082 before activating the updated API, then Web. Policy reads/final approvals fail closed when the policy schema is unavailable; absence of an API or schema is not treated as no policy. Never roll an API back to code that can bypass an existing policy. Preserve the event tables/guards and approved evidence during any coordinated rollback. Existing reviews without a configured policy keep their earlier rules after the schema is available.

## Verification and reproduction

- Real disposable PostgreSQL initialization installs existing graph constraints plus all three named policy guards. Canonical preview-producer, review-race, world-publication and work-session suites are retained. A wrong initial environment caused a skipped run; it is not counted as verification.
- The dedicated loopback databases used in this continuation are `studio_blueprint_resume_integration` and `studio_blueprint_lifecycle_integration`, on the already-existing test container. No production database or pre-existing test data is reset.
- `pnpm exec tsx scripts/verify-blueprint-continuation.mjs` against an owned local Vite origin verifies actual React UI at 1440/390/320px: configure, vote, explicit final approval, notification consent/save, automation preview/confirm and grouped inbox. No page errors or horizontal overflow were observed; screenshots were inspected.
- The browser runner deliberately intercepts policy HTTP responses and uses synthetic identity/aggregate data. It is not production authentication, real WAN, durable notification storage, or provider-delivery evidence. Separate PostgreSQL tests establish the repository/database behavior.
- `pnpm run build:bundle && pnpm run check:studio-bundle` passed the unchanged ratchet: 27 within baseline, 10 improved, 0 regressed. Post-shell static Studio: 5954.5 KiB raw / 1999.7 KiB gzip. Existing third-party build warnings and stale recorded runtime metrics are not counted as resolved or freshly measured.
- New policy, preference, notification, automation and transport regressions are registered in the required CI target manifest. Tests, timeouts, security guards and existing budgets are not weakened.

Final exact-head typecheck, shard results, CI status and merge identity are recorded separately after execution. Focused and shard test counts overlap and must not be summed into a claimed unique total.

## Remaining scope

This increment does not close every F01–F40 requirement: platform-specific delivery profiles/jobs/acceptance, complete team capacity planning, actual quiet-hour scheduled external delivery, full planning/assets/native-tool round trips, production/WAN multi-user follow mode, recorded-media policy, paid AI reconciliation and the full public automation/webhook service remain separate. Existing implemented comparison, personal drafts, saved views, world editing and drawing UX are retained rather than claimed as new.

The latest user scope is implementation and main merge only. No production deployment, Render restart, Cloudflare promotion, production migration, environment/secret, domain, paid plan, automatic deployment or protection override is performed.

## Completed local gate snapshot before latest-main integration

- Fresh-schema PostgreSQL: 4 files / 161 tests passed, including owner whole-work deletion with guarded child-history cascade.
- Required product shard: 49 files / 667 tests passed. Required studio-foundation shard: 260 files / 5,844 tests passed. These scopes overlap earlier targeted checks.
- New browser fixture: all 1440/390/320px journeys passed; inspected the mobile screenshot.
- Changed-file ESLint with zero warnings passed. The test-only deferred resolver typing was corrected; normal commit/push hooks recheck Web/API typing.

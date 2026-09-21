# 제작 워크플로 고도화 — 2026-09-21

Status: implemented increment; exact commit/CI/merge evidence is recorded in the PR.
User scope: **고도화 구현·검증과 main 머지까지만. 운영 배포는 다른 작업에서 수행한다.**
Base integrated: `6a90c25f5` (social-login changes already merged upstream).

## Current implementation

| Area | Implemented behavior | Boundary |
| --- | --- | --- |
| Task input | Same-task data refresh preserves dirty input; conflicting source changes are visible and block stale save/completion/delete. Exact own acknowledgement reconciles normalized input. | Unsaved task fields are in-memory, not a durable autosave or server receipt. |
| Mutation guard | Existing serialized update rechecks scope and current task identity. Unmounted/changed-session callbacks stop; duplicate pending submissions are blocked. | Existing server CAS/capability checks remain authoritative. This is not a new server operation API. |
| Personal views | Explicit save/load/delete of name, filter, sort and layout, scoped to account and workspace. Up to 16 validated names. | Actual SQLite/OPFS namespace `studio-production-views-v1`; Web Locks serialize updates. No localStorage fallback, task data, counts or permissions are persisted. |
| Calendar | Selected-month day groups use existing tasks and the active filter; missing/impossible dates are separated. Clicking returns to the same editor. | No automatic due-date or assignment changes; not an effort/capacity estimator. |
| Sorting | Original order, due date and priority, using copied projections. | Original task array and pending edits are not reordered or replaced. |
| Dependencies | On-demand unfinished/missing predecessors and downstream impact, with cycle-safe traversal. | Informational only; existing dependency validation remains intact. |
| Narrow screens | Existing input and new views remain keyboard-accessible with 44px controls, tested at 320/390/820/1440px. | Local fixture results do not certify all unrelated screens or physical pen devices. |

The list, episode matrix and calendar use the same task data. Task editors stay mounted across filters/layout/sort so switching views cannot discard pending input. Saved-view changes do not call the task commit API.

## Existing contracts preserved

No backend, database schema, migration, cloud configuration, role, secret, CI gate, global route, renderer, Undo or deployment policy is changed by this increment.

The actual ProductionHub passes its existing commit promise back to the TaskBoard so the UI can represent pending/failure without inventing success. Normal local and server persistence remains in the existing hub/repositories.

Corrupt or over-limit saved-view data is rejected without overwriting. A failed write leaves current work and view-name input intact. Views are read only after explicit user action; account/work changes remove prior view names from the mounted UI.

## Evidence

- Focused production-area run: **36 test files / 291 cases passed**, including existing hub mode/behavior, server client, workflow, identity and new saved-view/calendar/conflict tests.
- Actual browser fixture: **1440, 820, 390 and 320px passed**. It performs real SQLite/OPFS saved-view save → browser reload → load/apply → delete, and verifies native task UI conflict and calendar/sort round trips.
- Accessibility: WCAG 2 A/AA axe scan of the fixture main region, zero violations at those four widths; page horizontal overflow and uncaught errors checked.
- Fixture task content and its update callback are synthetic. It does not prove authenticated server writes, multi-account WAN behavior or production rollout. No production endpoints are mutated by the fixture.
- Full typecheck, broader regression shard, production build and exact-head remote CI are separate gates recorded in the PR rather than assumed from these focused results.

```sh
pnpm exec vitest run --maxWorkers=2 apps/web/src/domains/creator/studio-production
pnpm run typecheck
node scripts/ci-core-regression-shards.mjs studio-foundation
pnpm run build:bundle
pnpm exec vite --host 127.0.0.1 --port 4462 --strictPort
STUDIO_QA_BASE_URL=http://127.0.0.1:4462 node scripts/verify-blueprint-production-workflow.mjs
```

Generated screenshots and JSON are ignored artifacts under `artifacts/blueprint-production-workflow/`, not source or operating data.

## Blueprint trace and remaining work

This connects F19's saved-filter/sort/layout view, F20's calendar/list/matrix journey and F21's dependency-impact preview. It reinforces the F06 input and F39 non-destructive refresh boundaries. It does not mean all acceptance clauses of F01–F40 are complete.

Not implemented here: persistent private review drafts/batch comment publication (F11), server-enforced configurable review groups (F14), resource availability/effort scheduling (part of F21), signed outbound workflow webhooks (F36), new paid AI/provider execution, or production/WAN certification. Existing export/completion/AI code was not modified or claimed newly complete.

## Deployment handoff

No deployment command, Render restart, Cloudflare promotion, environment/secret change, infrastructure mutation or migration was executed for this increment. The deployment owner can select the reviewed merged main SHA separately. This web-only diff itself introduces no migration or new provider credential requirement.

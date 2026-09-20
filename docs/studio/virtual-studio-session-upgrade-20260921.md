# Virtual Studio WorkSession implementation — 2026-09-21

Status: local implementation; not a production deployment. Base: `cb2913ecf67241f3055111a1b23f600b91e90505`.

## Implemented production paths

- A session is a bounded, server-owned aggregate referencing one existing immutable review input. It does not copy manuscripts, approvals, production tasks or handoff envelopes.
- Actual graph revision/operation/receipt tables hold the history. This change introduces no new DB migration and does not execute production DDL.
- Fresh active user/work membership and exact input project/artifact/review/revision/hash are checked on reads and writes. Only the creator and invited users can read the session; generic graph APIs exclude or reject reserved session artifacts.
- Explicit draft, ready, start, pause, resume, close and cancel operations have expected-version CAS. The creator is initially participating; invitations do not join recipients automatically.
- Receipt recovery binds actor, work, session, operation ID and canonical request hash. Ambiguous results are read first; only an explicit retry resends the identical intent. Permission errors never become success.
- Server notes record the actual actor. Decisions require the current host. Closing needs an explicit outcome and does not approve a review, complete a task or publish work.
- Existing review history, production tasks and the actor's handoff envelopes provide validated result references. No fabricated counts or placeholder results are posted.
- The production board mounts an explicit lazy `StudioWorkSessionEntry`. Opening and reading never starts media. An unavailable API produces a visible error, not local pretend success.
- Session detail supports explicit participation, notes, closing confirmation, reading-turn selection, pinned preview and explicit page/viewport sharing. Following is opt-in, periodically refreshed and stopped by direct navigation. It is not a high-frequency P2P viewport stream and does not move editor selection.
- Input and outcome notes use per-actor/work/session tab drafts. Request intents use per-tab recovery storage; durable results are on the API.

## Verification boundaries

- Initial focused model/controller/service/module verification: 4 files, 31 tests passed.
- Actual detail component checks: 5 tests passed (transport, roster and preview boundaries are fixtures).
- Added PostgreSQL integration scenarios for exact receipt recovery, audience isolation, competing CAS updates, explicit lifecycle, membership revocation and invalid references. These require the existing CI PostgreSQL environment.
- A disposable local database bootstrap execution was blocked by the tool safety check. That operation was stopped; no production database was changed and local PostgreSQL PASS is not claimed.
- Final typecheck, lint and integration-branch reports must be attached to the reviewed commit before release.

## Deliberate limits and remaining design work

This is not completion of all 30 original requirements. Specialized script editing/reordering, native 3D scene synchronization, shared versioned material voting, structured AI evidence execution/diffs, external pinned guest review, capture/upload/retention, mentoring isolation and approved public showcase remain separate uncompleted journeys. Session kind labels do not prove those workflows exist.

Sessions currently cap at 24 participants, 100 notes, 64 linked results, 128 normal operations plus an explicit closing/cancellation operation, and 1,000 sessions per work. These are validation budgets, not multi-user performance certifications. Operation history compaction and active-session ownership transfer are not implemented. Work-scoped invited users do not receive new project permissions.

Primary files: `packages/studio-project-model/src/graph/work-session.ts`; `apps/api/src/modules/studio-project-graph/studio-work-session.*`; `apps/web/src/domains/creator/work-session/*`; the existing production hub entry and generic graph boundary.

No remote agent completed this implementation: the previous Codex and Claude invocations failed on usage/authentication respectively. Source was continued directly. Other worktrees, production settings, credentials and CI protections were not changed by these edits.

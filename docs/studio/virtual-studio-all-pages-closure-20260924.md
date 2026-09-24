# Virtual Studio and all-pages spatial experience — product-code closure

Date: 2026-09-24  
Scope: product code, domain contracts, migrations, browser flows, automated acceptance, and main-branch CI.  
Not claimed by this document: production rollout approval, real external email delivery, physical iOS/Android/stylus certification, long-haul WAN certification, or a one-hour manual session that was not actually executed.

## 1. Closure definition

This document supersedes the implementation status in `virtual-studio-design-closure-ledger-20260920.md`. That ledger remains historical evidence for the state observed on 2026-09-20; later main commits closed its listed product-code gaps.

A feature is marked product-code complete only when all applicable items exist:

1. a reachable user entry point;
2. a canonical domain identity rather than a visual-coordinate substitute;
3. authorization and explicit consent at the owning domain;
4. durable storage or an explicitly ephemeral contract;
5. recovery/idempotency behavior for writes;
6. automated tests for success, denial, stale state, and late results;
7. a non-spatial route or accessible fallback where walking is not required.

Environment certification is recorded separately. A green component test does not prove device, WAN, or production deployment quality.

## 2. Spatial platform closure

| Area | Product-code result | Evidence |
|---|---|---|
| All user-facing routes | Route families are bound to a spatial place or an explicit protected/alias exclusion. | `app/spatial-campus/campus-route-coverage.test.ts`, campus binding registry |
| Market | All ten registered market routes have spatial bindings while reusing canonical market pages and state. | spatial campus route coverage and market route registry |
| Fortune | All 29 registered experiences have stable observatory placement and preserve private inputs/results. | `fortune-campus-map.ts`, fortune registry coverage |
| Three equivalent views | Spatial, work, and focus views reuse domain-owned routes rather than duplicating data authority. | campus frame/room adapters and existing task frames |
| Exact return | Project/work/document/query identity is preserved through spatial transitions. | campus return resolver and route contract tests |
| Safe fallback | GPU or scene failure leaves the canonical work route available. | campus error/fallback contracts |
| World authoring | Validated manifests, templates, registered rules, publication CAS, and safe adoption remain separate from arbitrary code. | world template/rule/publication modules |
| Art and movement | Six art directions, independent NPC cast, fixed-step motion, collision, pathfinding, and reduced-motion handling. | Virtual Studio v3 art/physics tests and asset verifier |

## 3. Collaboration closure against VS-01–VS-30

| IDs | Closed product flow |
|---|---|
| VS-01, VS-02 | Durable work sessions bind purpose, exact scope, participants, presenter/follow state, evidence, decisions, and closure. Media consent remains separate. |
| VS-03, VS-20 | Storyboard and script-reading workflows use pinned inputs, participant turns, suggestions, and explicit application/approval. |
| VS-04, VS-05 | Exact revision comparison, anchored comments, task linkage, completion criteria, resubmission, and fresh re-review are connected by review-task completion. |
| VS-06 | Session decisions and review approvals retain actor, reason, exact revision, and event history. Review approval is still distinct from release/publication. |
| VS-07 | Handoff envelopes pin inputs, outputs, remaining notes, recipient identity, acknowledgement, and immutable history. |
| VS-08 | Asynchronous delivery distinguishes prepared, issued, delivered, accepted, cancelled, retry, and recovery states. P2P is only a notification hint. |
| VS-09 | Users can explicitly record or upload a maximum two-minute explanation pinned to one exact review revision, with required transcript, bounded retention, private immutable storage, signed playback, explicit deletion, ACL recheck, and expiry cleanup. It is never automatic call recording. |
| VS-10, VS-11 | Authenticated avatar cards and explicit greet/talk/follow/review/high-five request state machines retain decline, cancel, block, disconnect, and late-result behavior. |
| VS-12, VS-17 | Exact-roster consent, private door admission, server lease, media authority token, and authoritative seat locks gate collaboration. |
| VS-13 | External review remains a protected route with token hash, expiry/revocation, bounded pages, and no campus/team leakage. |
| VS-14, VS-18, VS-19 | Authored seats/activity anchors, role NPC routines, independent NPC art, player actions, and runtime resource cleanup are validated. |
| VS-15, VS-16, VS-28 | Versioned template packages, compatibility/rights metadata, registered no-code actions, confirmation gates, and rollback-safe world publication are implemented. |
| VS-21 | Scene/shot review sessions pin the selected render/camera identity and release runtime resources on exit. |
| VS-22 | Shared asset candidates retain stable identity/version, participant votes, decision history, and explicit apply. |
| VS-23 | Asset rights/use audit records source, license snapshot, manuscript usage, and release inclusion checks. |
| VS-24 | AI evidence records source/version, provider, uncertainty, cost category, output diff, and explicit human adoption. |
| VS-25 | Spatial and direct work/review routes are equivalent; no core tool requires avatar walking. |
| VS-26 | Mentoring sessions have mentor/learner roles, bounded source access, submissions, feedback, and explicit completion without broad team access. |
| VS-27 | Approved pinned-review snapshots can enter a separately authorized public showcase flow with preview, publication identity, revocation, and privacy inspection. |
| VS-29 | Runtime diagnostics distinguish fixture, browser, API, transport, media permission, storage, art integrity, and production evidence. |
| VS-30 | Published world revisions use content hashes, safe preload/adoption, acknowledgement, stale-scope rejection, reconnect recovery, and previous-world preservation on failure. |

## 4. Final gaps closed in this change

### 4.1 Door knock and explicit admission

A closed or restricted private room now supports an explicit knock only near its authored doorway. The request contains the current work, world revision, zone, door, team actor, and client instance. Managers can decline or open the current door for that active team member. Acceptance changes the authoritative door allowlist and remains in effect until a manager changes the door policy; it does not enter the requester automatically and grants no conversation, document, microphone, or camera authority. The requester must refresh current door state and explicitly enter. Spoofed actors, distant requests, viewers, expired packets, repeat spam, and stale responses fail closed.

### 4.2 Recorded review explanation

A review commenter may deliberately record or upload a short explanation. The browser requests microphone permission only after the record button is pressed. The audio is limited to two minutes and 5 MiB, magic-byte checked, stored in private immutable object storage, and referenced by an exact `workId/reviewId/revisionId/rootGraphHash` subject. A text alternative is mandatory. Playback requires a fresh authorization read and a five-minute signed URL; the repository rechecks the same note after signing to close deletion/revocation races. Retention is 7, 14, or 30 days. Deletion is explicit, idempotent, SHA-fenced, and removes shared bytes only after the last active reference disappears.

### 4.3 Central spatial intent planning

`studio-virtual-space-interaction-orchestrator.ts` now maps one proximity intent into exactly one of:

- a validated world-rule confirmation;
- an in-space panel;
- a canonical route.

It never performs the domain write itself. Review, team, release, media, and project authority remain in their owning API or controller.

## 5. Database and security boundaries

Migration `0090_studio_review_voice_note.sql` is forward-only and transaction wrapped. The table:

- matches JSON subject identity to indexed columns;
- accepts only private-object-storage v2 `derived` references whose digest, MIME, and byte length match the row;
- bounds size, duration, transcript, and retention;
- permits runtime `SELECT`, `INSERT`, and updates only to `deletedAt/deleteOperationId`;
- denies runtime delete/truncate/trigger/reference privileges;
- prevents mutation of review identity, transcript, object identity, hashes, and creation/expiry values;
- allows physical row deletion only as part of parent work deletion;
- revokes all PUBLIC privileges.

The production migration manifest, health readiness relation list, bootstrap database, review test database, runtime ACL generator, and ACL verification contract include the new table.

## 6. Acceptance evidence required before merge

The branch must pass:

- TypeScript application/API/worker typecheck;
- changed-file ESLint and architecture/application boundaries;
- full Virtual Studio suite;
- private-room and Huddle authority suites;
- review voice-note API, client, component, migration, module-DI, and PostgreSQL integration tests;
- all-pages campus route/market/fortune coverage;
- review-task completion, handoff, work-session, showcase, template/rule, and world-publication suites;
- production migration and runtime ACL contracts;
- production build, static CSP, third-party notice generation, and browser smoke;
- pull-request and post-merge protected CI.

## 7. Separate environment certification ledger

The following are not software-feature gaps and must not be reported as completed without executing them in the named environment:

| Certification | Required evidence |
|---|---|
| Physical iOS/Android and tablet pen | model/OS/browser/input, screenshots or traces, result SHA |
| Screen reader and forced-colors review | assistive technology/version, route, findings and fixes |
| Real WAN multi-party media | regions, participants, packet loss/latency, reconnect/revocation evidence |
| One-hour interactive spatial session | device/build SHA, memory/listener/media-track trend and failure log |
| Production rollout | approved deployment SHA, migration receipt, monitoring window and rollback record |
| External email delivery | provider receipt, bounce/revocation behavior and privacy review |

Until those runs exist, product code may be complete and merged, while the corresponding environment certification remains **not executed** rather than falsely marked failed or passed.

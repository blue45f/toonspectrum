# Private room client and media adapter

Status: current local implementation; deployment is not part of this change. This consumes the current world publication, acoustic door/session and conversation consent contracts. It does not promote proposed ADR 0024 to an accepted event authority.

## Authority and user actions

The page offers a door-bearing authored acoustic zone only after a world publication has been applied. The client passes the raw published world ID, revision ID and content hash to the Core API. A locally asserted hash, a Cloudflare ticket, peer announcement or seat lease is never a media grant. Core transport exposes its exact joined self connection and client instance only while that connection remains ready. Local/Cloudflare-only transports do not expose that capability.

An owner or current administrator reads the team roster and explicitly saves the door allowlist. All other users see their own entry permission without the allowlist. Admission is an explicit self action inside the exact authored zone. Human room names identify the destination. An explicit walk action queues only an exact reachable authored zone center through the existing navigation path; blocked or unreachable centers show an error, and admission remains disabled until the avatar actually arrives. Focus and away states explain why admission is unavailable. The existing Huddle view-only restriction remains in force: a viewer sees an explicit unavailable reason and is not admitted or offered as a media candidate. A downgrade clears the client lease and audience. The server view-level membership proof is not an upgrade to chat/media permission. A session lease only allows an invitation; it does not start a conversation or request a device.

Admitted peers exchange a small, bounded RTC announcement containing their current session epoch. The transport sender must match the announced client instance, and actual current presence must be in the same published geometry and proximity. These announcements are candidate identities only. The server verifies the 2–4 distinct actors and their current Core bindings, world/door epoch and session leases. The new Web proposal always includes the selected session epoch/client-instance mapping as `expectedMembers`. The server compares this constraint to its fresh verified descriptors before recording any consent; it is not a grant supplied by the client. The same mapping is bound into the idempotency receipt and the client preserves its expected roster across lost-response reads. Legacy callers may omit this optional constraint, while the new client never retries without it. Each person explicitly accepts their own member slot. The immutable consent revision and the ephemeral renewal CAS remain separate.

The private Huddle adapter creates an in-memory capability from a currently verified active server response. Its exact conversation and sorted peer list must match the launcher request. Opening or joining the Huddle is text-only. Camera, microphone and display capture remain explicit device actions. The capture controller checks the capability again after a delayed permission prompt and stops all returned tracks if the authority or session-publication generation changed. Environment audio stays in the existing local playback component; it is never a capture source.

## Cancellation, freshness and ambiguity

Actor replacement, Core disconnect/reconnect, world/zone identity replacement, hidden document, local expiry and actual geometry loss invalidate the local audience and close its scoped RTC controller. Normal window blur does not end a call. Same-account session publication preserves already running media while it cancels unfinished admission requests, re-reads current authority and fences pending device prompts. Returning from a private-zone boundary cannot revive the previous consent. An explicit local leave, decline, cancel or block also stays withdrawn when a lost HTTP response is followed by an older active server response.

Private rosters, team names, old conversation read queues and grant deadlines are cleared on authority loss. Another visit never reuses the prior roster with a new self epoch. Private legacy peers that cannot provide verified admission stay unavailable; existing public conversation contracts remain separate.

Server invalidation is a hint, not permission. The matching connection and self epoch stop local media before the controller reads the server again. Normal reads run while visible, with a local deadline bounded by both the server expiry and the 15-second request-start lease. Session renewals extend only the current self session. Conversation renewals use the observed ephemeral CAS and cannot recreate consent. A failed CAS is never automatically posted again with the same observed revision; reads reconcile it first. The server still owns every positive permission decision.

An uncertain session open is reconciled through `POST /sessions/read-open-intent` using its original input and Idempotency-Key. This endpoint performs no allocation or renewal and verifies the cookie actor, work ACL, original receipt, exact current lease, world, door and real Core binding. No result remains an uncertain intent. The user can explicitly retry that same input and key; there is no automatic POST retry. An expired, replaced or revoked original lease cannot be revived. Proposals and consent mutations reconcile by their known conversation ID and self epoch. Until the observed revision proves the earlier accept resolved, another acceptance is not automatically issued.

Core socket and PostgreSQL state are not one atomic system. A disconnect immediately known to this client closes its RTC session. A missed remote hint can remain unknown until the next read or the bounded lease deadline. The existing server maximum of 15 seconds therefore remains the upper authorization-observation window; this document does not claim instantaneous cross-process socket/DB/media revocation.

## Verification scope

Unit and component regressions cover exact roster consent, unknown/duplicate response rejection, lost mutation response handling, local withdrawal, boundary churn, old actor callbacks, session publication and pending capture cancellation. The actual PostgreSQL suite exercises receipt reads without creation/extension and refuses expired/replaced/closed intents.

The development-only two-context browser harness uses the real product hook, HTTP parser, private panel and Huddle. Its HTTP service, cookie identity and Core admission descriptors are synthetic. Ordered control packets and generated audio use real Chromium RTCDataChannel/RTCPeerConnection instances on loopback. It does not constitute an authenticated production API, real camera, real GPU, mobile device, multi-host or WAN validation. Results are written to `.qa/virtual-studio-private-room/result.json` by `scripts/verify-virtual-studio-private-room.mjs`; only a completed run is passing evidence.

## Validation handoff — 2026-09-20

This is a source checkpoint, not a completed end-to-end acceptance or deployment claim. The final private client, Page, Huddle, HTTP schema and service unit/component portfolio is executed before the checkpoint; the final run passed all 130 tests in 10 files (`/tmp/virtual-studio-private-commit-tests.log`). The CI execution contract passed 17 tests, and focused source lint passed before the normal commit hooks. An independent reviewer separately ran seven selected controller/Huddle race regressions successfully. The required CI manifest retains the whole virtual-space and Huddle directories and additionally executes the six actual Core transport/Room forwarding suites. The existing real PostgreSQL world-publication suite remains in both the protected database lane and the full database runner; no test or gate has been removed.

The first full Web typecheck encountered a heap limit because the normal 12 GB setting was omitted. The correctly configured retry was intentionally stopped after measured host contention (over 22 minutes wall time, under five minutes CPU), so neither run is a pass. Compiler implementation, TypeScript version 6.0.3, complete tsconfig, lockfile and compiler options matched the previously successful THIRD tree. That tree's intact incremental cache was copied byte-for-byte, with the old WORLD cache preserved and a SHA-256 receipt at `/tmp/virtual-studio-private-typecache-reuse-receipt.json`. No cached diagnostics, source hashes, compiler options or include/exclude lists were edited. The ordinary whole-source typecheck must still run on the final integrated source.

An earlier real database run completed 51 of 57 tests successfully and failed six with lease/stale assertions, timeouts and a teardown foreign-key error while other workloads were active. This is incomplete/failing evidence, not a database pass. The final suite now has 59 cases, including the expected-members identity constraint, receipt conflict, foreign-work and reconnect checks. Its complete rerun, final API typecheck and the two-browser RTC script are pending integration validation. The browser script has not yet produced a passing result artifact for this checkpoint.

Run the retained checks in sequence on the integrated tree; the env file below belongs only to this task's disposable local database and must not be logged or used for another database:

```sh
NODE_OPTIONS=--max-old-space-size=12288 pnpm exec tsc --noEmit --pretty false
pnpm --filter @webtoon-nest/api run typecheck
node --env-file=/tmp/virtual-studio-world-authority.env node_modules/vitest/vitest.mjs run --no-file-parallelism apps/api/src/modules/studio-project-graph/studio-world-publication.integration.test.ts
```

Serve that same tree with the existing Vite development server on an unused loopback port, then run:

```sh
STUDIO_QA_BASE_URL=http://127.0.0.1:5297 node scripts/verify-virtual-studio-private-room.mjs
```

The browser script supplies its own two synthetic HTTP/Core identities and exchanges real ordered RTC control and generated media between separate Chromium contexts. A subsequent actual authenticated Core/PG two-browser journey, real devices and WAN conditions remain distinct evidence and must never be inferred from this fixture.

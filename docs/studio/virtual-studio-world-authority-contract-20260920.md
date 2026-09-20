# Virtual Studio current-world authority

Status: current server contract; browser publication UI, realtime binding and private acoustic grants remain separate work.

The shared manifest and publication contract lives in `packages/studio-project-model/src/graph/world-publication.ts` because this payload is an existing Studio graph `asset` revision consumed by both API and Web. It imports no application, renderer, storage or networking code. The Web authoring validator consumes the same contract and retains additional renderer catalog, collision, reachability and animation checks. The server validates bounded structure, URLs, geometry, identity/reference integrity and acoustic-zone containment/non-overlap; publication does not certify a texture, renderer animation, reachable navigation path, membership, position or media grant. Asset URLs are data only and the API never fetches them.

## API

- `GET /studio-project-graph/works/:workId/world` returns `{ publication: null | StudioWorldPublication }` after current work view permission. Null means no server publication; it is not permission to substitute a local manifest for shared acoustic authority.
- `POST /studio-project-graph/works/:workId/world/publish`, authenticated and with `Idempotency-Key`, accepts `{ expectedPublishedRevisionId: string | null, manifest }`. It requires current work `manageMembers` permission (owner/admin). A first publication requires null; subsequent publications require the exact current publication revision.
- The response is `{ publication, replayed }`. Publication includes the full normalized manifest, its server-calculated canonical-JSON SHA-256 `contentHash`, work/project/artifact identity, exact immutable revision, previous publication revision, server operation sequence, publisher and server timestamp.
- Both endpoints are private/no-store. HTTP 403 denies access, 409 reports CAS or different-input idempotency conflict, and 422 reports invalid stored authority. The request parser rejects unknown fields, including client-supplied hashes or grants.

## Existing persistence and evidence

No schema, migration, event-stream service or operator infrastructure is added. One deterministic `studio-world-…` graph `asset` is bound to each work. The transaction uses the existing graph, immutable checkpoint, parent, operation and mutation-receipt tables. It acquires the work lock shared with membership mutations, then reads fresh membership in a separate statement. Publish serializes the artifact and commits manifest, parent, operation, receipt and graph pointer atomically.

Current publication is the latest dedicated server publication operation, verified against its exact receipt, request/payload hashes, canonical manifest digest, revision kind/operation range, parent, actor and work/project/artifact binding. It is not the generic artifact head, browser localStorage, Tiled version number, client presence content hash or seat lease. Missing evidence fails closed; the reader never falls back to a previous publication. The current graph receipt lifetime applies: deleting receipt evidence, including account-cascade removal of its publisher receipt, requires explicit repair and does not silently revive an earlier layout.

The generic graph create-project, create-artifact, commit and restore paths reject this new server-owned artifact namespace. A command named `studio.world.publish` on another ordinary asset creates no current-world authority. Ordinary graph assets retain their existing behavior. This is a narrow publication boundary over the current graph model, not adoption of Proposed ADR-0024's Production operation migration.

## Retry, undo and downstream scope

The same actor/key and normalized input return the original verified publication without appending another revision; a changed body conflicts. Replays check current manage permission and never move the current pointer back. Undo is an explicit new publication of a prior manifest with current CAS; the new publication has a new revision/sequence even if its content hash equals the older one.

The browser must use this endpoint before it can claim a shared published world. The next realtime/grant slice must bind the returned work, world id, revision/hash and zone definitions to authenticated participants, current memberships and real door authority. This slice creates no acoustic grant or closed-door state and does not change capture consent, Huddle membership or media routing.

## Verification

The dedicated PostgreSQL suite uses a new disposable loopback database with the existing full 0064 graph and 0077 membership migrations applied by the existing test preparation helper. It checks publish/read ACL, pending membership denial, exact retry/different-input conflict, concurrent CAS, explicit undo, generic graph spoofing/restore denial, stale generic head isolation, immutable operation enforcement, missing receipt failure, and membership revocation winning a work-lock race for read/publish/replay. The suite is included in required core database execution and the full PostgreSQL runner, and excluded only from DB-less static execution. Shared parser, existing Web authoring/world, endpoint/error mapping and actual Nest module DI regressions complement it.
